import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  dailyMeanScores,
  describe as describeStats,
  filterByPeriod,
  histogram,
  menuValues,
  pfcRatio,
  setValues,
  summarize,
  topMenus,
} from '../../web/src/lib/dashboard.ts';

const menu = (name, score, e, p, f, c) => ({ name, score, nutrition: { エネルギー: e, たんぱく質: p, 脂質: f, 炭水化物: c } });
const days = [
  { date: '2026-08-01', menus: [menu('カレー', 0.2, 700, 20, 20, 100)] },
  { date: '2026-10-01', menus: [menu('カレー', 0.1, 700, 20, 20, 100), menu('サラダ', 0.3, 100, 5, 5, 10)] },
  { date: '2026-10-20', menus: [menu('焼き魚', 0.4, 300, 25, 10, 5), menu('サラダ', 0.2, 100, 5, 5, 10)] },
  { date: '2026-10-25', menus: [] },
];

test('filterByPeriod: 今日から N 日前以降（今日以降も含む）。メニューのない日は除く', () => {
  assert.deepEqual(filterByPeriod(days, '4w', '2026-10-20').map((d) => d.date), ['2026-10-01', '2026-10-20']);
  assert.deepEqual(filterByPeriod(days, '3m', '2026-10-20').map((d) => d.date), ['2026-08-01', '2026-10-01', '2026-10-20']);
  assert.deepEqual(filterByPeriod(days, 'all', '2026-10-20').map((d) => d.date), ['2026-08-01', '2026-10-01', '2026-10-20']);
  // 28日間の境目: 10/20 から数えて 28 日目は 9/23
  assert.deepEqual(filterByPeriod([{ date: '2026-09-23', menus: [menu('a', 0, 0, 0, 0, 0)] }, { date: '2026-09-22', menus: [menu('a', 0, 0, 0, 0, 0)] }], '4w', '2026-10-20').map((d) => d.date), ['2026-09-23']);
});

test('summarize: 日数・メニュー数・平均スコア（%）・1セットあたりの平均', () => {
  const s = summarize(filterByPeriod(days, 'all', '2026-10-20'));
  assert.equal(s.dayCount, 3);
  assert.equal(s.menuCount, 5);
  assert.ok(Math.abs(s.meanScore - 24) < 1e-9);
  assert.equal(s.meanSetEnergy, (700 + 800 + 400) / 3);
  assert.equal(s.meanSetProtein, (20 + 25 + 30) / 3);
  assert.deepEqual(summarize([]), { dayCount: 0, menuCount: 0, meanScore: 0, meanSetEnergy: 0, meanSetProtein: 0 });
});

test('dailyMeanScores / topMenus: 日ごとの平均、回数の多い順（同数は名前順）', () => {
  const scores = dailyMeanScores(filterByPeriod(days, 'all', '2026-10-20'));
  assert.deepEqual(scores.map((d) => [d.date, Math.round(d.score)]), [['2026-08-01', 20], ['2026-10-01', 20], ['2026-10-20', 30]]);
  assert.deepEqual(topMenus(days, 2), [{ name: 'カレー', count: 2 }, { name: 'サラダ', count: 2 }]);
});

test('pfcRatio: グラム数の割合で、3つの合計が 100%', () => {
  // P 20g・F 20g・C 60g → 20% / 20% / 60%（カロリー換算ではない）
  const r = pfcRatio([{ date: 'x', menus: [menu('a', 0, 0, 10, 15, 30), menu('b', 0, 0, 10, 5, 30)] }]);
  assert.deepEqual(r, { protein: 20, fat: 20, carbs: 60 });
  const all = pfcRatio(days);
  assert.ok(Math.abs(all.protein + all.fat + all.carbs - 100) < 1e-9);
  assert.equal(pfcRatio([]), null);
});

test('histogram / describe: 空の階級も残す。統計は最小・平均・最大・標準偏差', () => {
  assert.deepEqual(histogram([0, 4, 5, 12], 5), [
    { from: 0, to: 5, count: 2 },
    { from: 5, to: 10, count: 1 },
    { from: 10, to: 15, count: 1 },
  ]);
  assert.deepEqual(histogram([], 5), []);
  assert.deepEqual(describeStats([2, 4, 4, 4, 5, 5, 7, 9]), { min: 2, mean: 5, max: 9, std: 2 });
  assert.equal(describeStats([]), null);
});

test('setValues / menuValues: セットごとは品数・平均スコア・合計、1品ごとは各メニューの値', () => {
  const picked = filterByPeriod(days, 'all', '2026-10-20');
  const perSet = setValues(picked);
  assert.deepEqual(perSet.count, [1, 2, 2]);
  assert.deepEqual(perSet.energy, [700, 800, 400]);
  assert.deepEqual(perSet.protein, [20, 25, 30]);
  assert.deepEqual(perSet.score.map((v) => Math.round(v)), [20, 20, 30]);
  assert.deepEqual(perSet.vegetable, [0, 0, 0]);
  const perMenu = menuValues(picked);
  assert.deepEqual(perMenu.energy, [700, 700, 100, 300, 100]);
  assert.equal('count' in perMenu, false);
});
