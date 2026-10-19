import { test } from 'node:test';
import assert from 'node:assert/strict';

import { addDays, formatDateLabel, pickDefaultDate, todayInTokyo, weekdayOf } from '../../web/src/lib/date.ts';

test('todayInTokyo: 日本時間の日付を返す（UTC では前日でも日本時間の今日）', () => {
  // 2026-10-19 08:30 JST = 2026-10-18 23:30 UTC
  assert.equal(todayInTokyo(new Date('2026-10-18T23:30:00Z')), '2026-10-19');
  // 2026-10-19 23:59 JST = 2026-10-19 14:59 UTC
  assert.equal(todayInTokyo(new Date('2026-10-19T14:59:00Z')), '2026-10-19');
  assert.equal(todayInTokyo(new Date('2026-10-19T15:00:00Z')), '2026-10-20');
});

test('formatDateLabel: "M/D(曜)" の形にする', () => {
  assert.equal(formatDateLabel('2026-10-30'), '10/30(金)');
  assert.equal(formatDateLabel('2026-01-04'), '1/4(日)');
  assert.throws(() => formatDateLabel('10/30'), /日付の形式/);
});

test('weekdayOf / addDays: 月またぎ・年またぎ・うるう年', () => {
  assert.equal(weekdayOf('2026-10-19'), 1);
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2028-02-28', 1), '2028-02-29');
  assert.equal(addDays('2026-03-01', -1), '2026-02-28');
});

test('pickDefaultDate: 今日以降でメニューがある最初の日', () => {
  const dates = ['2026-10-23', '2026-10-16', '2026-10-26', '2026-10-27'];
  assert.equal(pickDefaultDate(dates, '2026-10-23'), '2026-10-23');
  // 土曜（10/24）に開くと、次の営業日（月曜 10/26）
  assert.equal(pickDefaultDate(dates, '2026-10-24'), '2026-10-26');
  assert.equal(pickDefaultDate(dates, '2026-10-28'), null);
  assert.equal(pickDefaultDate([], '2026-10-28'), null);
});
