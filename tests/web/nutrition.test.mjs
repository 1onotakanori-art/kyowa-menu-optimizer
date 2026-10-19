import { test } from 'node:test';
import assert from 'node:assert/strict';

import { TARGET_FIELDS, addNutrition, differenceFromTargets, roundTenth, sumNutrition } from '../../web/src/lib/nutrition.ts';

const rice = { name: 'ご飯', nutrition: { エネルギー: 252, たんぱく質: 3.8, 脂質: 0.5, 炭水化物: 55.7, 野菜重量: 0, 小麦: '－' } };
const salad = { name: 'サラダ', nutrition: { エネルギー: 45.5, たんぱく質: 1.2, 脂質: 2.1, 炭水化物: 5.4, 野菜重量: 80, 小麦: '◯' } };

test('sumNutrition: 数値の項目だけを足し、アレルゲンなどの文字列は無視する', () => {
  const total = sumNutrition([rice, salad]);
  assert.equal(total['エネルギー'], 297.5);
  assert.equal(total['野菜重量'], 80);
  assert.equal(roundTenth(total['たんぱく質']), 5);
  assert.equal('小麦' in total, false);
  assert.deepEqual(sumNutrition([]), {});
});

test('addNutrition: 元のオブジェクトを書き換えない', () => {
  const base = { エネルギー: 100 };
  const result = addNutrition(base, { エネルギー: 50, 脂質: 3 });
  assert.deepEqual(result, { エネルギー: 150, 脂質: 3 });
  assert.deepEqual(base, { エネルギー: 100 });
});

test('differenceFromTargets: 目標がある項目だけ、+ が超過・- が不足', () => {
  const diff = differenceFromTargets({ エネルギー: 700, たんぱく質: 25, 脂質: 10 }, { エネルギー: 650, たんぱく質: 30, 野菜重量: 120 });
  assert.deepEqual(diff, { エネルギー: 50, たんぱく質: -5, 野菜重量: -120 });
});

test('TARGET_FIELDS: E/P/F/C/V の5項目と初期値', () => {
  assert.deepEqual(
    TARGET_FIELDS.map((f) => [f.short, f.key, f.defaultValue]),
    [
      ['E', 'エネルギー', 650],
      ['P', 'たんぱく質', 30],
      ['F', '脂質', 25],
      ['C', '炭水化物', 95],
      ['V', '野菜重量', 120],
    ],
  );
});
