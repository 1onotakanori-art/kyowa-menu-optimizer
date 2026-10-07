import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  normalizeText,
  validateConditions,
  matchMenu,
  evaluateRules,
} from '../../supabase/functions/_shared/matchRules.js';

const menus0821 = JSON.parse(
  readFileSync(new URL('../../menus/menus_2026-08-21.json', import.meta.url), 'utf8')
).menus;

const curry = {
  name: 'カレーライス',
  nutrition: { エネルギー: 700, たんぱく質: 18, 海老: '－', カニ: '－', 小麦: '◯' },
};

test('normalizeText: 全角・半角・ひらがな・カタカナ・空白の違いを吸収する', () => {
  assert.equal(normalizeText('カレー'), normalizeText('かれー'));
  assert.equal(normalizeText('ｶﾚｰ'), normalizeText('カレー'));
  assert.equal(normalizeText('ＡＢＣ'), 'abc');
  assert.equal(normalizeText('当店手作り　温泉玉子'), normalizeText('当店手作り温泉玉子'));
  assert.equal(normalizeText(null), '');
});

test('validateConditions: 正しい条件は ok', () => {
  const result = validateConditions({
    all: [
      { field: 'name', op: 'contains_any', value: ['カレー', '唐揚げ'] },
      { field: 'たんぱく質', op: '>=', value: 20 },
      { field: 'allergen', op: 'excludes', value: ['海老', 'カニ'] },
    ],
  });
  assert.deepEqual(result, { ok: true, errors: [] });
});

test('validateConditions: 不正な条件はエラーを返す', () => {
  const cases = [
    null,
    {},
    { all: [] },
    { all: [{ field: 'name', op: '>=', value: 'x' }] },
    { all: [{ field: 'name', op: 'contains_any', value: [] }] },
    { all: [{ field: 'name', op: 'contains_any', value: ['  '] }] },
    { all: [{ field: 'name', op: 'equals', value: '' }] },
    { all: [{ field: 'たんぱく質', op: '>=', value: '20' }] },
    { all: [{ field: 'たんぱく質', op: 'contains_any', value: 20 }] },
    { all: [{ field: 'allergen', op: 'excludes', value: ['キウイ'] }] },
    { all: [{ field: 'カロリー', op: '>=', value: 1 }] },
    { all: Array.from({ length: 11 }, () => ({ field: 'たんぱく質', op: '>=', value: 1 })) },
  ];
  for (const conditions of cases) {
    const result = validateConditions(conditions);
    assert.equal(result.ok, false, JSON.stringify(conditions));
    assert.ok(result.errors.length > 0);
  }
});

test('matchMenu: メニュー名の完全一致は表記ゆれを吸収し、部分一致はしない', () => {
  assert.equal(matchMenu(curry, { all: [{ field: 'name', op: 'equals', value: 'かれーらいす' }] }), true);
  assert.equal(matchMenu(curry, { all: [{ field: 'name', op: 'equals', value: 'カレー' }] }), false);
});

test('matchMenu: キーワードを含む / 含まない', () => {
  assert.equal(matchMenu(curry, { all: [{ field: 'name', op: 'contains_any', value: ['唐揚げ', 'ｶﾚｰ'] }] }), true);
  assert.equal(matchMenu(curry, { all: [{ field: 'name', op: 'contains_any', value: ['唐揚げ'] }] }), false);
  assert.equal(matchMenu(curry, { all: [{ field: 'name', op: 'not_contains_any', value: ['カレー'] }] }), false);
  assert.equal(matchMenu(curry, { all: [{ field: 'name', op: 'not_contains_any', value: ['揚げ'] }] }), true);
});

test('matchMenu: 栄養値の境界は以上・以下を含む', () => {
  assert.equal(matchMenu(curry, { all: [{ field: 'たんぱく質', op: '>=', value: 18 }] }), true);
  assert.equal(matchMenu(curry, { all: [{ field: 'たんぱく質', op: '>=', value: 18.1 }] }), false);
  assert.equal(matchMenu(curry, { all: [{ field: 'エネルギー', op: '<=', value: 700 }] }), true);
  assert.equal(matchMenu(curry, { all: [{ field: 'エネルギー', op: '<=', value: 699 }] }), false);
});

test('matchMenu: 栄養値が欠けているメニューは該当しない', () => {
  assert.equal(matchMenu(curry, { all: [{ field: '食塩相当量', op: '<=', value: 100 }] }), false);
});

test('matchMenu: アレルゲン除外は「－」のときだけ含まないとみなす', () => {
  assert.equal(matchMenu(curry, { all: [{ field: 'allergen', op: 'excludes', value: ['海老', 'カニ'] }] }), true);
  assert.equal(matchMenu(curry, { all: [{ field: 'allergen', op: 'excludes', value: ['小麦'] }] }), false);
  // データに項目がない（卵）場合は安全側に倒して「含む」扱い
  assert.equal(matchMenu(curry, { all: [{ field: 'allergen', op: 'excludes', value: ['卵'] }] }), false);
});

test('matchMenu: 複数条件は AND、Supabase の menu_name 形式も受け付ける', () => {
  const row = { menu_name: curry.name, nutrition: curry.nutrition };
  const conditions = {
    all: [
      { field: 'name', op: 'contains_any', value: ['カレー'] },
      { field: 'たんぱく質', op: '>=', value: 15 },
    ],
  };
  assert.equal(matchMenu(row, conditions), true);
  conditions.all.push({ field: 'エネルギー', op: '<=', value: 500 });
  assert.equal(matchMenu(row, conditions), false);
});

test('evaluateRules: 実データ（8/21）でヒットしたルールだけを返す', () => {
  const rules = [
    { id: 1, name: 'カレーの日', conditions: { all: [{ field: 'name', op: 'contains_any', value: ['カレー'] }] } },
    { id: 2, name: 'ラーメン', conditions: { all: [{ field: 'name', op: 'contains_any', value: ['ラーメン'] }] } },
    { id: 3, name: '無効', enabled: false, conditions: { all: [{ field: 'name', op: 'contains_any', value: ['カレー'] }] } },
    { id: 4, name: '不正', conditions: { all: [] } },
    {
      id: 5,
      name: '高たんぱく・海老なし',
      conditions: {
        all: [
          { field: 'たんぱく質', op: '>=', value: 16 },
          { field: 'allergen', op: 'excludes', value: ['海老'] },
        ],
      },
    },
  ];

  const results = evaluateRules(menus0821, rules);

  assert.deepEqual(results.map(r => r.ruleId), [1, 5]);
  assert.deepEqual(results[0].menus.map(m => m.name), ['カレーライス', 'カレーライスミニ']);
  const highProtein = results[1].menus.map(m => m.name);
  assert.ok(highProtein.includes('チンゲン菜と豚肉のチャンプルー'));
  assert.ok(highProtein.includes('モチコチキン'));
  assert.ok(!highProtein.includes('豆腐と海老の和風生姜あんかけ'));
  for (const menu of results[1].menus) {
    assert.ok(menu.nutrition['たんぱく質'] >= 16);
    assert.equal(menu.nutrition['海老'], '－');
  }
});

test('evaluateRules: ヒットなしなら空配列', () => {
  assert.deepEqual(evaluateRules([], [{ id: 1, name: 'x', conditions: { all: [{ field: 'name', op: 'equals', value: 'x' }] } }]), []);
});
