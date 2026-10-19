import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildMealRecord, selectionFromRecord } from '../../web/src/lib/mealRecord.ts';

const menus = [
  { name: 'カレー', nutrition: { エネルギー: 700, たんぱく質: 20, 脂質: 25, 炭水化物: 95, 野菜重量: 80, 小麦: '◯' } },
  { name: 'サラダ', nutrition: { エネルギー: 50.5, たんぱく質: 1, 脂質: 2, 炭水化物: 5, 野菜重量: 100 } },
  { name: 'プリン', nutrition: { エネルギー: 150 } },
];

test('buildMealRecord: 今の管理画面と同じ形で、選んだメニューと評価・5項目の合計を入れる', () => {
  const row = buildMealRecord('2026-10-19', menus, new Map([['サラダ', 5], ['カレー', 3]]), new Date('2026-10-19T03:00:00Z'));
  assert.equal(row.day_of_week, '月');
  assert.equal(row.user_name, 'ONO');
  assert.equal(row.timestamp, '2026-10-19T03:00:00.000Z');
  assert.deepEqual(row.selected_menus.map((m) => [m.name, m.rating]), [['カレー', 3], ['サラダ', 5]]);
  assert.deepEqual(row.selected_menus[0].nutrition, menus[0].nutrition);
  assert.deepEqual(row.totals, { エネルギー: 750.5, たんぱく質: 21, 脂質: 27, 炭水化物: 100, 野菜重量: 180 });
  assert.deepEqual(row.settings, { targets: {}, preferences: {} });
  assert.deepEqual(row.achievement, {});
});

test('selectionFromRecord: 保存済みの記録から選択と評価を戻す', () => {
  const selection = selectionFromRecord({ selected_menus: [{ name: 'カレー', rating: 4 }, { name: 'サラダ' }, { name: 'プリン', rating: 9 }, { rating: 2 }] });
  assert.deepEqual([...selection], [['カレー', 4], ['サラダ', 3], ['プリン', 3]]);
  assert.equal(selectionFromRecord(null).size, 0);
  assert.equal(selectionFromRecord({ selected_menus: 'broken' }).size, 0);
});
