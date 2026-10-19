import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildPreview, countUpcomingHitDays, groupMenusByDate, menuNameOptions } from '../../web/src/lib/notifyPreview.ts';
import { isAdminUser, readAuthError } from '../../web/src/lib/auth.ts';

const rows = [
  { date: '2026-10-16', menu_name: 'カレーライス', nutrition: { エネルギー: 800 } },
  { date: '2026-10-16', menu_name: 'サラダ', nutrition: null },
  { date: '2026-10-19', menu_name: 'カツカレー', nutrition: { エネルギー: 950 } },
  { date: '2026-10-20', menu_name: '焼き魚', nutrition: { エネルギー: 400 } },
  { date: '2026-10-21', menu_name: 'カレーうどん', nutrition: { エネルギー: 600 } },
];
const curry = { all: [{ field: 'name', op: 'contains_any', value: ['カレー'] }] };

test('groupMenusByDate / menuNameOptions: 日付ごとにまとめ、名前の候補は重複なしで並べる', () => {
  const byDate = groupMenusByDate(rows);
  assert.deepEqual([...byDate.keys()], ['2026-10-16', '2026-10-19', '2026-10-20', '2026-10-21']);
  assert.deepEqual(byDate.get('2026-10-16')[1], { name: 'サラダ', nutrition: {} });
  assert.equal(menuNameOptions(byDate).length, 5);
});

test('buildPreview: 今日以降の該当日とメニュー、過去の該当日数', () => {
  const preview = buildPreview(groupMenusByDate(rows), curry, '2026-10-19');
  assert.deepEqual(preview.upcoming, [
    { date: '2026-10-19', names: ['カツカレー'] },
    { date: '2026-10-21', names: ['カレーうどん'] },
  ]);
  assert.equal(preview.pastDays, 1);
  assert.equal(preview.pastHitDays, 1);
  assert.equal(countUpcomingHitDays(groupMenusByDate(rows), curry, '2026-10-20'), 1);
});

test('readAuthError: メールのリンクのエラーを読む', () => {
  assert.match(readAuthError('#error=access_denied&error_description=Email+link+is+invalid'), /Email link is invalid/);
  assert.equal(readAuthError(''), null);
  assert.equal(readAuthError('#access_token=x'), null);
});

test('isAdminUser: app_metadata.role が admin のときだけ', () => {
  assert.equal(isAdminUser({ app_metadata: { role: 'admin' } }), true);
  assert.equal(isAdminUser({ app_metadata: { role: 'user' } }), false);
  assert.equal(isAdminUser({}), false);
  assert.equal(isAdminUser(null), false);
});
