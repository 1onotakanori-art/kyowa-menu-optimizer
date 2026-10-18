/**
 * 朝の通知メール送信（毎朝 pg_cron から呼ばれる）
 *
 * 1. その日のメニューを取得（0件なら休業日として終了）
 * 2. 通知オン・当日の曜日が対象のユーザーと、そのルールを取得
 * 3. matchRules.js で判定し、該当があれば1人1通にまとめて Gmail SMTP で送信
 * 4. notification_deliveries に記録（同じ日に二重送信しない）
 *
 * リクエスト（POST, JSON。すべて省略可）:
 *   { "date": "YYYY-MM-DD", "dry_run": true, "only_email": "you@example.com" }
 *   - dry_run: 判定だけ行い、送信も記録もしない
 *   - only_email: そのアドレスのユーザーだけを対象にする（動作確認用）
 * 認証: ヘッダー x-cron-secret を Vault の notify_cron_secret と照合する
 *
 * Secrets: GMAIL_USER, GMAIL_APP_PASSWORD（必須）, MAIL_FROM_NAME, APP_BASE_URL（任意）
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import nodemailer from 'npm:nodemailer@6';
import { evaluateRules } from '../_shared/matchRules.js';
import { buildDigestEmail } from '../_shared/digestEmail.js';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const APP_BASE_URL = (Deno.env.get('APP_BASE_URL') ?? 'https://1onotakanori-art.github.io/kyowa-menu-optimizer').replace(/\/$/, '');
const MAIL_FROM_NAME = Deno.env.get('MAIL_FROM_NAME') ?? '共和食堂メニュー通知';
const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

type Menu = { name: string; nutrition: Record<string, unknown> };
type Rule = { id: number; user_id: string; name: string; enabled: boolean; conditions: { all: unknown[] } };

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** Asia/Tokyo の今日を YYYY-MM-DD で返す */
function jstToday(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

/** ISO 曜日（1=月 … 7=日） */
function isoWeekday(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay() || 7;
}

async function fetchConfirmedEmails(): Promise<Map<string, string>> {
  const emails = new Map<string, string>();
  const perPage = 1000;
  for (let page = 1; ; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const user of data.users) {
      if (user.email && user.email_confirmed_at) emails.set(user.id, user.email);
    }
    if (data.users.length < perPage) break;
  }
  return emails;
}

/**
 * その日の送信権を確保する。確保できたら true。
 * 未記録なら pending で作成、該当なし/失敗の記録があれば pending に戻す。
 * 送信済み・送信中なら false（二重送信の防止）。
 */
async function claimDelivery(userId: string, date: string, matched: unknown): Promise<boolean> {
  const { data: inserted, error: insertError } = await supabase
    .from('notification_deliveries')
    .upsert({ user_id: userId, menu_date: date, status: 'pending', matched }, { onConflict: 'user_id,menu_date', ignoreDuplicates: true })
    .select('id');
  if (insertError) throw insertError;
  if (inserted && inserted.length > 0) return true;

  const { data: reclaimed, error: updateError } = await supabase
    .from('notification_deliveries')
    .update({ status: 'pending', matched, error: null })
    .eq('user_id', userId)
    .eq('menu_date', date)
    .in('status', ['skipped', 'failed'])
    .select('id');
  if (updateError) throw updateError;
  return Boolean(reclaimed && reclaimed.length > 0);
}

async function recordDelivery(userId: string, date: string, fields: Record<string, unknown>) {
  const { error } = await supabase
    .from('notification_deliveries')
    .update(fields)
    .eq('user_id', userId)
    .eq('menu_date', date);
  if (error) throw error;
}

async function run({ date, dryRun, onlyEmail }: { date: string; dryRun: boolean; onlyEmail: string | null }) {
  const { data: menuRows, error: menuError } = await supabase
    .from('menus')
    .select('menu_name, nutrition')
    .eq('date', date);
  if (menuError) throw menuError;
  if (!menuRows || menuRows.length === 0) {
    return { date, status: 'no_menus', message: 'この日のメニューがないため送信しません（休業日など）' };
  }
  const menus: Menu[] = menuRows.map(row => ({ name: row.menu_name, nutrition: row.nutrition }));

  const weekday = isoWeekday(date);
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('user_id, unsubscribe_token')
    .eq('email_enabled', true)
    .contains('notify_weekdays', [weekday]);
  if (profileError) throw profileError;

  const { data: ruleRows, error: ruleError } = await supabase
    .from('notification_rules')
    .select('id, user_id, name, enabled, conditions')
    .eq('enabled', true);
  if (ruleError) throw ruleError;
  const rulesByUser = new Map<string, Rule[]>();
  for (const rule of (ruleRows ?? []) as Rule[]) {
    if (!rulesByUser.has(rule.user_id)) rulesByUser.set(rule.user_id, []);
    rulesByUser.get(rule.user_id)!.push(rule);
  }

  const emails = await fetchConfirmedEmails();

  let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
  const getTransporter = () => {
    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('Secrets GMAIL_USER / GMAIL_APP_PASSWORD が設定されていません');
    }
    // Edge Function は 25 / 587 番ポートへの接続が禁止されているため 465（SSL）を使う
    transporter ??= nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
    });
    return transporter;
  };

  const summary = { date, dryRun, menus: menus.length, users: 0, sent: 0, skipped: 0, alreadyDone: 0, failed: 0 };
  const details: unknown[] = [];

  for (const profile of profiles ?? []) {
    const email = emails.get(profile.user_id);
    if (!email) continue;
    if (onlyEmail && email.toLowerCase() !== onlyEmail.toLowerCase()) continue;
    summary.users++;

    const rules = rulesByUser.get(profile.user_id) ?? [];
    const results = evaluateRules(menus, rules);
    const matched = results.map(r => ({ ruleId: r.ruleId, ruleName: r.ruleName, menus: r.menus.map((m: Menu) => m.name) }));

    if (dryRun) {
      details.push({ email, rules: rules.length, matched });
      continue;
    }

    if (results.length === 0) {
      // 該当なしは記録だけ（同じ日に既に記録があれば何もしない）
      const { error } = await supabase
        .from('notification_deliveries')
        .upsert({ user_id: profile.user_id, menu_date: date, status: 'skipped', matched: [] }, { onConflict: 'user_id,menu_date', ignoreDuplicates: true });
      if (error) throw error;
      summary.skipped++;
      continue;
    }

    if (!(await claimDelivery(profile.user_id, date, matched))) {
      summary.alreadyDone++;
      continue;
    }

    const conditionsById = new Map(rules.map(rule => [rule.id, rule.conditions]));
    const unsubscribeUrl = `${APP_BASE_URL}/unsubscribe.html?token=${profile.unsubscribe_token}`;
    const oneClickUrl = `${SUPABASE_URL}/functions/v1/unsubscribe?token=${profile.unsubscribe_token}`;
    const mail = buildDigestEmail({
      date,
      results: results.map(r => ({ ...r, conditions: conditionsById.get(r.ruleId) })),
      appUrl: `${APP_BASE_URL}/`,
      settingsUrl: `${APP_BASE_URL}/notify.html`,
      unsubscribeUrl,
    });

    try {
      const info = await getTransporter().sendMail({
        from: { name: MAIL_FROM_NAME, address: GMAIL_USER! },
        to: email,
        subject: mail.subject,
        text: mail.text,
        html: mail.html,
        headers: {
          'List-Unsubscribe': `<${oneClickUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      });
      await recordDelivery(profile.user_id, date, { status: 'sent', provider_id: info.messageId ?? null, error: null });
      summary.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`send failed for ${profile.user_id}: ${message}`);
      await recordDelivery(profile.user_id, date, { status: 'failed', error: message.slice(0, 500) });
      summary.failed++;
    }
  }

  return dryRun ? { ...summary, details } : summary;
}

Deno.serve(async req => {
  if (req.method !== 'POST') return json({ error: 'POST で呼び出してください' }, 405);

  const secret = req.headers.get('x-cron-secret') ?? '';
  const { data: authorized, error: authError } = await supabase.rpc('verify_notify_cron_secret', { secret });
  if (authError) return json({ error: `認証に失敗しました: ${authError.message}` }, 500);
  if (!authorized) return json({ error: 'unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const date = body.date ?? jstToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return json({ error: 'date は YYYY-MM-DD 形式で指定してください' }, 400);

  try {
    const result = await run({ date, dryRun: body.dry_run === true, onlyEmail: body.only_email ?? null });
    console.log(JSON.stringify({ ...result, details: undefined }));
    return json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    return json({ error: message }, 500);
  }
});
