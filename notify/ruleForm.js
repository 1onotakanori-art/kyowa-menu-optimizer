/**
 * 通知ルール編集フォーム ⇔ 条件DSL の相互変換（DOM 非依存）
 *
 * フォームの形:
 *   {
 *     nameMode: 'none' | 'equals' | 'contains',
 *     nameText: string,       // equals: メニュー名 / contains: キーワード（区切り: 空白・カンマ・読点）
 *     excludeText: string,    // 含まないキーワード
 *     nutrition: { [栄養素]: { min: string, max: string } },
 *     allergens: string[],    // 使っていないものだけに絞るアレルゲン
 *   }
 */

import { NUTRITION_FIELDS } from '../supabase/functions/_shared/matchRules.js';

/**
 * キーワード文字列を配列に分割する（重複・空要素は除く）
 * @param {string} text
 * @returns {string[]}
 */
export function splitKeywords(text) {
  const words = String(text ?? '')
    .split(/[\s,、，]+/)
    .map(w => w.trim())
    .filter(Boolean);
  return [...new Set(words)];
}

function parseNumber(text) {
  const trimmed = String(text ?? '').trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.normalize('NFKC'));
  // 不正値は NaN のまま返し、validateConditions でエラーにする
  return value;
}

export function emptyForm() {
  return {
    nameMode: 'none',
    nameText: '',
    excludeText: '',
    nutrition: Object.fromEntries(NUTRITION_FIELDS.map(f => [f, { min: '', max: '' }])),
    allergens: [],
  };
}

/**
 * フォームの値から条件DSLを組み立てる
 * @returns {{ all: object[] }}
 */
export function formToConditions(form) {
  const all = [];

  if (form.nameMode === 'equals') {
    all.push({ field: 'name', op: 'equals', value: form.nameText.trim() });
  } else if (form.nameMode === 'contains') {
    all.push({ field: 'name', op: 'contains_any', value: splitKeywords(form.nameText) });
  }

  const exclude = splitKeywords(form.excludeText);
  if (exclude.length > 0) {
    all.push({ field: 'name', op: 'not_contains_any', value: exclude });
  }

  for (const field of NUTRITION_FIELDS) {
    const min = parseNumber(form.nutrition?.[field]?.min);
    const max = parseNumber(form.nutrition?.[field]?.max);
    if (min !== null) all.push({ field, op: '>=', value: min });
    if (max !== null) all.push({ field, op: '<=', value: max });
  }

  if (form.allergens.length > 0) {
    all.push({ field: 'allergen', op: 'excludes', value: [...form.allergens] });
  }

  return { all };
}

/**
 * 条件DSLからフォームの値を復元する（編集時）
 * @param {{ all: object[] }} conditions
 */
export function conditionsToForm(conditions) {
  const form = emptyForm();
  for (const { field, op, value } of conditions?.all ?? []) {
    if (field === 'name' && op === 'equals') {
      form.nameMode = 'equals';
      form.nameText = value;
    } else if (field === 'name' && op === 'contains_any') {
      form.nameMode = 'contains';
      form.nameText = value.join(' ');
    } else if (field === 'name' && op === 'not_contains_any') {
      form.excludeText = value.join(' ');
    } else if (NUTRITION_FIELDS.includes(field)) {
      form.nutrition[field][op === '>=' ? 'min' : 'max'] = String(value);
    } else if (field === 'allergen' && op === 'excludes') {
      form.allergens = [...value];
    }
  }
  return form;
}
