import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';

import { calculateDistance, fixedOnlyResult, optimizeMenus } from '../../web/src/lib/optimizer.ts';

const menu = (name, e, p, f, c, v) => ({
  name,
  nutrition: { エネルギー: e, たんぱく質: p, 脂質: f, 炭水化物: c, 野菜重量: v, 卵: '－' },
});

test('calculateDistance: ぴったりなら 0、目標がなければ 0', () => {
  assert.equal(calculateDistance({ エネルギー: 600 }, { エネルギー: 600 }), 0);
  assert.equal(calculateDistance({}, { エネルギー: 600 }), 0);
});

test('calculateDistance: エネルギーは超過 10%・不足 20% の幅で評価する', () => {
  // 超過 60（= 10%）→ 1、不足 120（= 20%）→ 1
  assert.equal(calculateDistance({ エネルギー: 600 }, { エネルギー: 660 }), 1);
  assert.equal(calculateDistance({ エネルギー: 600 }, { エネルギー: 480 }), 1);
});

test('calculateDistance: たんぱく質・野菜は超過を、脂質・炭水化物は不足を数えない', () => {
  assert.equal(calculateDistance({ たんぱく質: 30, 野菜重量: 100 }, { たんぱく質: 60, 野菜重量: 300 }), 0);
  assert.equal(calculateDistance({ 脂質: 25, 炭水化物: 95 }, { 脂質: 0, 炭水化物: 0 }), 0);
  // たんぱく質の不足 3（= 10%）→ 1。項目数 2 で平均して 0.5
  assert.equal(calculateDistance({ たんぱく質: 30, 野菜重量: 100 }, { たんぱく質: 27, 野菜重量: 100 }), 0.5);
});

test('optimizeMenus: 固定は必ず含め、除外は使わず、追加は上限まで', () => {
  const menus = [
    menu('定食', 600, 25, 20, 80, 50),
    menu('サラダ', 50, 2, 3, 5, 100),
    menu('ご飯', 250, 4, 1, 55, 0),
    menu('唐揚げ', 400, 20, 25, 15, 0),
  ];
  const result = optimizeMenus({
    menus,
    targets: { エネルギー: 700, 野菜重量: 150 },
    fixedNames: ['定食'],
    excludedNames: ['唐揚げ'],
    maxAdditional: 1,
  });
  assert.deepEqual(result.fixedMenus.map((m) => m.name), ['定食']);
  assert.deepEqual(result.additionalMenus.map((m) => m.name), ['サラダ']);
  assert.deepEqual(result.selectedMenus.map((m) => m.name), ['定食', 'サラダ']);
  assert.equal(result.totalNutrition['エネルギー'], 650);
  assert.deepEqual(result.difference, { エネルギー: -50, 野菜重量: 0 });
  assert.equal(result.distance, calculateDistance(result.targets, result.totalNutrition));
});

test('optimizeMenus: どの追加も目標から遠ざかるなら、何も足さない', () => {
  const menus = [menu('定食', 700, 30, 20, 90, 120), menu('ケーキ', 400, 5, 25, 50, 0)];
  const result = optimizeMenus({ menus, targets: { エネルギー: 700 }, fixedNames: ['定食'], maxAdditional: 3 });
  assert.deepEqual(result.additionalMenus, []);
  assert.equal(result.distance, 0);
});

test('optimizeMenus: ローカルサーチで貪欲法の取りこぼしを直す', () => {
  // 貪欲法だけだと、まず 1000 に最も近い A(600) を選び、次に B(420) を足して 1020 で止まる。
  // 入れ替えを試すと C(550) + D(450) で目標ちょうどになる
  const menus = [menu('A', 600, 0, 0, 0, 0), menu('B', 420, 0, 0, 0, 0), menu('C', 550, 0, 0, 0, 0), menu('D', 450, 0, 0, 0, 0)];
  const result = optimizeMenus({ menus, targets: { エネルギー: 1000 }, maxAdditional: 2 });
  assert.deepEqual(result.additionalMenus.map((m) => m.name).sort(), ['C', 'D']);
  assert.equal(result.distance, 0);
});

test('fixedOnlyResult: 固定メニューだけで集計する', () => {
  const menus = [menu('定食', 600, 25, 20, 80, 50), menu('サラダ', 50, 2, 3, 5, 100)];
  const result = fixedOnlyResult(menus, { エネルギー: 650 }, ['定食']);
  assert.deepEqual(result.selectedMenus.map((m) => m.name), ['定食']);
  assert.deepEqual(result.additionalMenus, []);
  assert.deepEqual(result.difference, { エネルギー: -50 });
});

test('optimizeMenus: 実際のメニューで、上限・固定・除外を守り、何も足さない場合より悪くならない', () => {
  const dir = new URL('../../menus/', import.meta.url);
  const files = readdirSync(dir).filter((f) => /^menus_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().slice(-5);
  const targets = { エネルギー: 650, たんぱく質: 30, 脂質: 25, 炭水化物: 95, 野菜重量: 120 };
  for (const file of files) {
    const { menus } = JSON.parse(readFileSync(new URL(file, dir), 'utf8'));
    const fixedNames = [menus[0].name];
    const excludedNames = [menus[1].name];
    const result = optimizeMenus({ menus, targets, fixedNames, excludedNames, maxAdditional: 4 });
    assert.ok(result.additionalMenus.length <= 4, file);
    assert.ok(result.selectedMenus.some((m) => m.name === menus[0].name), file);
    assert.ok(!result.selectedMenus.some((m) => m.name === menus[1].name), file);
    assert.ok(result.distance <= fixedOnlyResult(menus, targets, fixedNames).distance, file);
  }
});

test('targetStatus: 距離と同じ許容幅で、目標どおり・多い・少ないを決める', async () => {
  const { targetStatus } = await import('../../web/src/lib/optimizer.ts');
  assert.equal(targetStatus('エネルギー', 650, 715), 'good');
  assert.equal(targetStatus('エネルギー', 650, 716), 'over');
  assert.equal(targetStatus('エネルギー', 650, 520), 'good');
  assert.equal(targetStatus('エネルギー', 650, 519), 'under');
  assert.equal(targetStatus('たんぱく質', 30, 90), 'good');
  assert.equal(targetStatus('たんぱく質', 30, 26), 'under');
  assert.equal(targetStatus('脂質', 25, 0), 'good');
  assert.equal(targetStatus('脂質', 25, 28), 'over');
});
