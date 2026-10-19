/**
 * 通知メールの配信停止
 *
 * - メールの List-Unsubscribe ヘッダー（ワンクリック停止, RFC 8058）からの POST
 * - unsubscribe.html（GitHub Pages / Vercel）のボタンからの POST
 * のどちらも POST /functions/v1/unsubscribe?token=<unsubscribe_token> で受ける。
 * GET では停止しない（メールのリンク先読み込みで誤って停止されないように）。
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders, parseAllowedOrigins } from '../_shared/cors.js';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

// ブラウザから呼んでよいサイト（_shared/cors.js）。ALLOWED_ORIGINS で上書きできる
const ALLOWED_ORIGINS = parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS'));

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async req => {
  const cors = corsHeaders(req.headers.get('Origin'), ALLOWED_ORIGINS);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
    });

  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
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
