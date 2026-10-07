import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  splitKeywords,
  emptyForm,
  formToConditions,
  conditionsToForm,
} from '../../notify/ruleForm.js';
import { validateConditions } from '../../supabase/functions/_shared/matchRules.js';

test('splitKeywords: 空白・全角空白・カンマ・読点で区切り、重複を除く', () => {
  assert.deepEqual(splitKeywords(' カレー　唐揚げ,カツ、カレー ，丼 '), ['カレー', '唐揚げ', 'カツ', '丼']);
  assert.deepEqual(splitKeywords(''), []);
});

test('formToConditions: 何も指定しないと条件なし（検証エラー）', () => {
  const conditions = formToConditions(emptyForm());
  assert.deepEqual(conditions, { all: [] });
  assert.equal(validateConditions(conditions).ok, false);
});

test('formToConditions: 全項目を条件DSLに変換する', () => {
  const form = emptyForm();
  form.nameMode = 'contains';
  form.nameText = 'カレー 唐揚げ';
  form.excludeText = 'ミニ';
  form.nutrition['たんぱく質'].min = '２０';
  form.nutrition['エネルギー'].max = '600';
  form.allergens = ['海老', 'カニ'];

  const conditions = formToConditions(form);
  assert.deepEqual(conditions, {
    all: [
      { field: 'name', op: 'contains_any', value: ['カレー', '唐揚げ'] },
      { field: 'name', op: 'not_contains_any', value: ['ミニ'] },
      { field: 'エネルギー', op: '<=', value: 600 },
      { field: 'たんぱく質', op: '>=', value: 20 },
      { field: 'allergen', op: 'excludes', value: ['海老', 'カニ'] },
    ],
  });
  assert.equal(validateConditions(conditions).ok, true);
});

test('formToConditions: 数値でない入力は検証エラーになる', () => {
  const form = emptyForm();
  form.nutrition['脂質'].max = 'abc';
  assert.equal(validateConditions(formToConditions(form)).ok, false);
});

test('formToConditions: 完全一致は前後の空白を除く', () => {
  const form = emptyForm();
  form.nameMode = 'equals';
  form.nameText = '  モチコチキン ';
  assert.deepEqual(formToConditions(form).all, [{ field: 'name', op: 'equals', value: 'モチコチキン' }]);
});

test('conditionsToForm → formToConditions で元の条件に戻る', () => {
  const original = {
    all: [
      { field: 'name', op: 'equals', value: 'モチコチキン' },
      { field: 'name', op: 'not_contains_any', value: ['ミニ', '小'] },
      { field: '食塩相当量', op: '<=', value: 2.5 },
      { field: 'たんぱく質', op: '>=', value: 15 },
      { field: 'allergen', op: 'excludes', value: ['小麦'] },
    ],
  };
  const roundTrip = formToConditions(conditionsToForm(original));
  const sortKey = c => `${c.field}${c.op}`;
  assert.deepEqual(
    [...roundTrip.all].sort((a, b) => sortKey(a).localeCompare(sortKey(b))),
    [...original.all].sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
  );
});
