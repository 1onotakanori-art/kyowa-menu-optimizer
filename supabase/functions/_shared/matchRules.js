/**
 * 通知ルールの判定ロジック（依存なしの ES Module）
 *
 * 次の3か所から同じファイルを import して使う:
 *   - Edge Function（Deno）: supabase/functions/send-daily-digest
 *   - ブラウザ: notify.html のプレビュー
 *   - Node の単体テスト: tests/notify/matchRules.test.mjs
 *
 * 条件DSL:
 *   { "all": [ { "field": "name", "op": "contains_any", "value": ["カレー"] },
 *              { "field": "たんぱく質", "op": ">=", "value": 20 },
 *              { "field": "allergen", "op": "excludes", "value": ["海老", "カニ"] } ] }
 *   all 内の条件はすべて満たす必要がある（AND）。ルール同士は OR。
 */

export const NUTRITION_FIELDS = Object.freeze([
  'エネルギー',
  'たんぱく質',
  '脂質',
  '炭水化物',
  '飽和脂肪酸',
  '食塩相当量',
  '野菜重量',
]);

export const ALLERGEN_FIELDS = Object.freeze([
  '卵',
  '乳類',
  '小麦',
  'そば',
  '落花生',
  '海老',
  'カニ',
  '牛肉',
  'くるみ',
  '大豆',
  '鶏肉',
  '豚肉',
]);

export const NUTRITION_UNITS = Object.freeze({
  エネルギー: 'kcal',
  たんぱく質: 'g',
  脂質: 'g',
  炭水化物: 'g',
  飽和脂肪酸: 'g',
  食塩相当量: 'g',
  野菜重量: 'g',
});

/** メニューデータで「含まない」を表す値。これ以外（◯ や未知の値）は安全側に倒して「含む」とみなす */
const ALLERGEN_FREE = '－';

const NAME_OPS = ['equals', 'contains_any', 'not_contains_any'];
const NUMBER_OPS = ['>=', '<='];
const ALLERGEN_OPS = ['excludes'];

export const MAX_CONDITIONS = 10;
export const MAX_KEYWORDS = 20;

/**
 * 文字列比較用の正規化
 * - NFKC（全角英数→半角、半角カナ→全角 など）
 * - 小文字化
 * - カタカナ→ひらがな（「カレー」と「かれー」を同一視）
 * - 空白（全角含む）を除去
 * @param {unknown} text
 * @returns {string}
 */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/\s+/g, '');
}

function menuName(menu) {
  return menu?.name ?? menu?.menu_name ?? '';
}

function isNonEmptyStringArray(value, max) {
  return (
    Array.isArray(value) &&
    value.length >= 1 &&
    value.length <= max &&
    value.every(v => typeof v === 'string' && normalizeText(v) !== '')
  );
}

/**
 * 1つの条件を検証する
 * @returns {string|null} エラーメッセージ（問題なければ null）
 */
function validateCondition(cond, index) {
  const at = `条件${index + 1}`;
  if (!cond || typeof cond !== 'object' || Array.isArray(cond)) {
    return `${at}: 条件の形式が不正です`;
  }
  const { field, op, value } = cond;

  if (field === 'name') {
    if (!NAME_OPS.includes(op)) return `${at}: メニュー名に使えない演算子です (${op})`;
    if (op === 'equals') {
      return typeof value === 'string' && normalizeText(value) !== ''
        ? null
        : `${at}: メニュー名を入力してください`;
    }
    return isNonEmptyStringArray(value, MAX_KEYWORDS)
      ? null
      : `${at}: キーワードを1〜${MAX_KEYWORDS}個入力してください`;
  }

  if (NUTRITION_FIELDS.includes(field)) {
    if (!NUMBER_OPS.includes(op)) return `${at}: 栄養値に使えない演算子です (${op})`;
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? null
      : `${at}: ${field} の値は0以上の数値で入力してください`;
  }

  if (field === 'allergen') {
    if (!ALLERGEN_OPS.includes(op)) return `${at}: アレルゲンに使えない演算子です (${op})`;
    return isNonEmptyStringArray(value, ALLERGEN_FIELDS.length) &&
      value.every(v => ALLERGEN_FIELDS.includes(v))
      ? null
      : `${at}: アレルゲンの指定が不正です`;
  }

  return `${at}: 不明な項目です (${field})`;
}

/**
 * 条件DSLを検証する
 * @param {unknown} conditions
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateConditions(conditions) {
  const all = conditions?.all;
  if (!Array.isArray(all) || all.length === 0) {
    return { ok: false, errors: ['条件を1つ以上指定してください'] };
  }
  if (all.length > MAX_CONDITIONS) {
    return { ok: false, errors: [`条件は${MAX_CONDITIONS}個までです`] };
  }
  const errors = all.map(validateCondition).filter(Boolean);
  return { ok: errors.length === 0, errors };
}

function matchCondition(menu, { field, op, value }) {
  if (field === 'name') {
    const name = normalizeText(menuName(menu));
    if (op === 'equals') return name === normalizeText(value);
    const hit = value.some(word => name.includes(normalizeText(word)));
    return op === 'contains_any' ? hit : !hit;
  }

  if (NUTRITION_FIELDS.includes(field)) {
    const actual = menu?.nutrition?.[field];
    // 値が欠けているメニューは条件を満たさないものとして扱う
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
    return op === '>=' ? actual >= value : actual <= value;
  }

  if (field === 'allergen') {
    return value.every(allergen => menu?.nutrition?.[allergen] === ALLERGEN_FREE);
  }

  return false;
}

/**
 * メニューが条件をすべて満たすか
 * 不正な条件は常に false（検証は validateConditions で事前に行う）
 * @param {{ name?: string, menu_name?: string, nutrition?: object }} menu
 * @param {{ all: object[] }} conditions
 * @returns {boolean}
 */
export function matchMenu(menu, conditions) {
  if (!validateConditions(conditions).ok) return false;
  return conditions.all.every(cond => matchCondition(menu, cond));
}

/**
 * 条件を人が読める文に変換する（設定画面の一覧・通知メール本文用）
 * @param {{ all: object[] }} conditions
 * @returns {string[]} 条件ごとの説明文
 */
export function describeConditions(conditions) {
  const quote = words => words.map(w => `「${w}」`).join('');
  return (conditions?.all ?? []).map(({ field, op, value }) => {
    if (field === 'name') {
      if (op === 'equals') return `メニュー名が「${value}」`;
      if (op === 'contains_any') return `${quote(value)}のいずれかを含む`;
      if (op === 'not_contains_any') return `${quote(value)}を含まない`;
    }
    if (NUTRITION_FIELDS.includes(field)) {
      return `${field} ${value}${NUTRITION_UNITS[field]}${op === '>=' ? '以上' : '以下'}`;
    }
    if (field === 'allergen') return `${value.join('・')}を使っていない`;
    return '不明な条件';
  });
}

/**
 * その日のメニューにルール群を適用する
 * 無効（enabled=false）・不正なルールは無視する。ヒットしたルールだけを返す。
 * @param {Array<{ name?: string, menu_name?: string, nutrition?: object }>} menus
 * @param {Array<{ id?: number, name: string, enabled?: boolean, conditions: object }>} rules
 * @returns {Array<{ ruleId: number|undefined, ruleName: string, menus: object[] }>}
 */
export function evaluateRules(menus, rules) {
  const results = [];
  for (const rule of rules) {
    if (rule.enabled === false) continue;
    if (!validateConditions(rule.conditions).ok) continue;
    const hits = menus.filter(menu => rule.conditions.all.every(cond => matchCondition(menu, cond)));
    if (hits.length > 0) {
      results.push({ ruleId: rule.id, ruleName: rule.name, menus: hits });
    }
  }
  return results;
}
