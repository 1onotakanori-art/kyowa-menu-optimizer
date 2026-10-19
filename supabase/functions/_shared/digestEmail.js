/**
 * 朝の通知メール（件名・テキスト本文・HTML本文）を組み立てる（依存なしの ES Module）
 * Edge Function send-daily-digest から使い、Node の単体テストで検証する。
 */

import { describeConditions, NUTRITION_UNITS } from './matchRules.js';

const SUMMARY_FIELDS = ['エネルギー', 'たんぱく質', '脂質', '炭水化物'];

/** "2026-10-17" → "10/17(土)" */
export function formatDateJa(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const weekday = '日月火水木金土'[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}/${d}(${weekday})`;
}

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** "エネルギー 250kcal / たんぱく質 16.5g / …"（値がない項目は省く） */
export function nutritionSummary(nutrition) {
  return SUMMARY_FIELDS.filter(field => typeof nutrition?.[field] === 'number')
    .map(field => `${field} ${nutrition[field]}${NUTRITION_UNITS[field]}`)
    .join(' / ');
}

/** メールに載せるサイト（Vercel の本番）。Edge Function のシークレット APP_BASE_URL で上書きできる */
export const DEFAULT_APP_BASE_URL = 'https://kyowa-menu-optimizer.vercel.app';

/**
 * メールに載せるリンク。Vercel では拡張子なしの URL で各ページを配信する（cleanUrls）
 * @param {string | undefined | null} baseUrl
 * @param {string} unsubscribeToken
 * @returns {{ appUrl: string, settingsUrl: string, unsubscribeUrl: string }}
 */
export function buildAppLinks(baseUrl, unsubscribeToken) {
  const base = String(baseUrl || DEFAULT_APP_BASE_URL).replace(/\/+$/, '');
  return {
    appUrl: `${base}/`,
    settingsUrl: `${base}/notify`,
    unsubscribeUrl: `${base}/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`,
  };
}

/**
 * @param {object} params
 * @param {string} params.date - "YYYY-MM-DD"
 * @param {Array<{ ruleName: string, conditions: object, menus: Array<{ name: string, nutrition: object }> }>} params.results
 * @param {string} params.appUrl - メニュー最適化アプリの URL
 * @param {string} params.settingsUrl - 通知設定ページの URL
 * @param {string} params.unsubscribeUrl - 配信停止ページの URL
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildDigestEmail({ date, results, appUrl, settingsUrl, unsubscribeUrl }) {
  const dateLabel = formatDateJa(date);
  const menuCount = new Set(results.flatMap(r => r.menus.map(m => m.name))).size;
  const subject = `【共和食堂】${dateLabel} 通知ルールに合うメニューがあります（${menuCount}品）`;

  const textSections = results.map(r =>
    [
      `■ ${r.ruleName}`,
      `  条件: ${describeConditions(r.conditions).join(' ／ ')}`,
      ...r.menus.map(m => {
        const summary = nutritionSummary(m.nutrition);
        return `  ・${m.name}${summary ? `（${summary}）` : ''}`;
      }),
    ].join('\n')
  );
  const text = [
    `${dateLabel} の共和食堂のメニューに、通知ルールに合うものがあります。`,
    '',
    textSections.join('\n\n'),
    '',
    `メニューを見る: ${appUrl}`,
    `通知設定を変更する: ${settingsUrl}`,
    `通知メールを停止する: ${unsubscribeUrl}`,
    '',
    '-- ',
    '共和食堂メニュー通知（このメールは送信専用です）',
  ].join('\n');

  const htmlSections = results
    .map(r => `
      <div style="margin:0 0 20px;">
        <div style="font-size:16px;font-weight:bold;color:#007AFF;">■ ${escapeHtml(r.ruleName)}</div>
        <div style="font-size:12px;color:#666;margin:2px 0 6px;">条件: ${escapeHtml(describeConditions(r.conditions).join(' ／ '))}</div>
        <ul style="margin:0;padding-left:20px;">
          ${r.menus
            .map(m => {
              const summary = nutritionSummary(m.nutrition);
              return `<li style="margin:4px 0;"><b>${escapeHtml(m.name)}</b>${
                summary ? `<br><span style="font-size:12px;color:#666;">${escapeHtml(summary)}</span>` : ''
              }</li>`;
            })
            .join('')}
        </ul>
      </div>`)
    .join('');

  const html = `<!DOCTYPE html>
<html lang="ja">
<body style="margin:0;padding:16px;background:#f5f5f7;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans',sans-serif;color:#333;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:20px;">
    <p style="margin:0 0 16px;font-size:15px;">${escapeHtml(dateLabel)} の共和食堂のメニューに、通知ルールに合うものがあります。</p>
    ${htmlSections}
    <p style="margin:16px 0 0;"><a href="${escapeHtml(appUrl)}" style="display:inline-block;background:#007AFF;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold;">メニューを見る</a></p>
  </div>
  <p style="max-width:560px;margin:12px auto 0;font-size:11px;color:#999;line-height:1.6;">
    共和食堂メニュー通知（このメールは送信専用です）<br>
    <a href="${escapeHtml(settingsUrl)}" style="color:#999;">通知設定を変更する</a> ・
    <a href="${escapeHtml(unsubscribeUrl)}" style="color:#999;">通知メールを停止する</a>
  </p>
</body>
</html>`;

  return { subject, text, html };
}
