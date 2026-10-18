/**
 * 通知メールの配信停止
 *
 * - メールの List-Unsubscribe ヘッダー（ワンクリック停止, RFC 8058）からの POST
 * - unsubscribe.html（GitHub Pages）のボタンからの POST
 * のどちらも POST /functions/v1/unsubscribe?token=<unsubscribe_token> で受ける。
 * GET では停止しない（メールのリンク先読み込みで誤って停止されないように）。
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://1onotakanori-art.github.io',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (req.method !== 'POST') return json({ ok: false, error: 'POST で呼び出してください' }, 405);

  const token = new URL(req.url).searchParams.get('token') ?? '';
  if (!UUID_PATTERN.test(token)) return json({ ok: false, error: 'リンクが正しくありません' }, 400);

  const { data, error } = await supabase
    .from('profiles')
    .update({ email_enabled: false })
    .eq('unsubscribe_token', token)
    .select('user_id');
  if (error) return json({ ok: false, error: '処理に失敗しました' }, 500);
  if (!data || data.length === 0) return json({ ok: false, error: 'リンクが正しくないか、期限切れです' }, 404);

  return json({ ok: true });
});
