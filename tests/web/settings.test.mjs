import { test } from 'node:test';
import assert from 'node:assert/strict';

import { activeTargets, defaultSettings, parseSettings, serializeSettings } from '../../web/src/lib/settings.ts';
import { mapAISelectionRow, mapMenuRows } from '../../web/src/lib/mappers.ts';

test('parseSettings: 保存がない・壊れている場合は初期値（5項目とも有効、上限 5）', () => {
  for (const raw of [null, '', '{', '"text"', 'null']) {
    assert.deepEqual(parseSettings(raw), defaultSettings(), String(raw));
  }
  assert.deepEqual(activeTargets(defaultSettings()), { エネルギー: 650, たんぱく質: 30, 脂質: 25, 炭水化物: 95, 野菜重量: 120 });
});

test('parseSettings: 保存した値を戻し、おかしな項目だけ初期値で補う', () => {
  const settings = defaultSettings();
  settings.targets['エネルギー'] = { enabled: true, value: 700 };
  settings.targets['脂質'] = { enabled: false, value: 20 };
  settings.maxAdditional = 3;
  assert.deepEqual(parseSettings(serializeSettings(settings)), settings);

  const partial = parseSettings(JSON.stringify({ maxAdditional: 99, targets: { たんぱく質: { enabled: 'yes', value: -1 }, 野菜重量: { value: 200 } } }));
  assert.equal(partial.maxAdditional, 20);
  assert.deepEqual(partial.targets['たんぱく質'], { enabled: true, value: 30 });
  assert.deepEqual(partial.targets['野菜重量'], { enabled: true, value: 200 });
});

test('activeTargets: 有効にした目標だけ', () => {
  const settings = defaultSettings();
  for (const key of ['たんぱく質', '脂質', '炭水化物', '野菜重量']) settings.targets[key].enabled = false;
  assert.deepEqual(activeTargets(settings), { エネルギー: 650 });
});

test('mapMenuRows: menu_name を name にし、栄養値がなければ空', () => {
  assert.deepEqual(mapMenuRows([{ menu_name: 'カレー', nutrition: { エネルギー: 700 } }, { menu_name: '水', nutrition: null }]), [
    { name: 'カレー', nutrition: { エネルギー: 700 } },
    { name: '水', nutrition: {} },
  ]);
});

test('mapAISelectionRow: 順位で並べ、欠けた項目は補い、説明文は文字列のときだけ使う', () => {
  const selection = mapAISelectionRow({
    date: '2026-10-30',
    generated_at: '2026-10-17T23:02:45Z',
    set_comment: '  ',
    model_info: { set_reason: '普段のセットの形に近づけて選定' },
    selected_menus: [
      { name: 'サラダ', rank: 2, score: 0.05, role: 'side', roleLabel: '副菜', reasons: ['野菜が多い', 1], nutrition: { エネルギー: 50 } },
      { name: 'チャーハン', rank: 1, score: 0.1, role: 'staple', roleLabel: '主食' },
      { rank: 3 },
      'broken',
    ],
  });
  assert.equal(selection.setComment, null);
  assert.equal(selection.setReason, '普段のセットの形に近づけて選定');
  assert.deepEqual(selection.menus.map((m) => m.name), ['チャーハン', 'サラダ']);
  assert.deepEqual(selection.menus[1].reasons, ['野菜が多い']);
  assert.deepEqual(selection.menus[0].reasons, []);
  assert.deepEqual(selection.menus[0].nutrition, {});

  assert.deepEqual(mapAISelectionRow({ date: '2026-10-30', selected_menus: null }).menus, []);
});
