/**
 * Edge Function の CORS（ブラウザから呼んでよいサイトの判定。依存なしの ES Module）
 *
 * 許可するのは次のどれか:
 *   - 環境変数 ALLOWED_ORIGINS（カンマ区切り）に書いたサイト。未設定なら DEFAULT_ALLOWED_ORIGINS
 *   - この Vercel プロジェクトのプレビュー（kyowa-menu-optimizer-<id>-takanoris-projects-ff756f89.vercel.app）
 *
 * CORS が守るのは「ブラウザで応答を読めるか」だけ。配信停止そのものはトークンを知っていることで認める。
 */

/** Vercel の本番（https://kyowa-menu-optimizer.vercel.app）と、移行期間中の GitHub Pages */
export const DEFAULT_ALLOWED_ORIGINS = Object.freeze([
  'https://kyowa-menu-optimizer.vercel.app',
  'https://1onotakanori-art.github.io',
  'https://kyowa-menu-optimizer-takanoris-projects-ff756f89.vercel.app',
]);

const VERCEL_PREVIEW_ORIGIN = /^https:\/\/kyowa-menu-optimizer-[a-z0-9-]+-takanoris-projects-ff756f89\.vercel\.app$/;

/**
 * 環境変数の値を許可リストにする
 * @param {string | undefined | null} value
 * @returns {string[]}
 */
export function parseAllowedOrigins(value) {
  const list = String(value ?? '')
    .split(',')
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length > 0 ? list : [...DEFAULT_ALLOWED_ORIGINS];
}

/**
 * リクエストの Origin を許可するか
 * @param {string | null} origin
 * @param {readonly string[]} allowed
 * @returns {boolean}
 */
export function isAllowedOrigin(origin, allowed) {
  if (!origin) return false;
  return allowed.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin);
}

/**
 * 応答に付ける CORS ヘッダー。許可しないサイトには Access-Control-Allow-Origin を付けない
 * @param {string | null} origin
 * @param {readonly string[]} allowed
 * @returns {Record<string, string>}
 */
export function corsHeaders(origin, allowed) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin',
  };
  return isAllowedOrigin(origin, allowed) ? { ...headers, 'Access-Control-Allow-Origin': origin } : headers;
}
