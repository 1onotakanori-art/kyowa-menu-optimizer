import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatDateJa,
  escapeHtml,
  nutritionSummary,
  buildDigestEmail,
} from '../../supabase/functions/_shared/digestEmail.js';

const params = {
  date: '2026-10-16',
  appUrl: 'https://example.com/app/',
  settingsUrl: 'https://example.com/app/notify.html',
  unsubscribeUrl: 'https://example.com/app/unsubscribe.html?token=abc',
  results: [
    {
      ruleName: 'カレーの日',
      conditions: { all: [{ field: 'name', op: 'contains_any', value: ['カレー'] }] },
      menus: [
        { name: 'カレーライス', nutrition: { エネルギー: 700, たんぱく質: 18, 脂質: 20, 炭水化物: 100 } },
        { name: 'カレーライスミニ', nutrition: { エネルギー: 400 } },
      ],
    },
    {
      ruleName: '<高たんぱく>',
      conditions: { all: [{ field: 'たんぱく質', op: '>=', value: 15 }] },
      menus: [{ name: 'カレーライス', nutrition: { たんぱく質: 18 } }],
    },
  ],
};

test('formatDateJa: 曜日付きの日付', () => {
  assert.equal(formatDateJa('2026-10-16'), '10/16(金)');
  assert.equal(formatDateJa('2026-10-18'), '10/18(日)');
});

test('escapeHtml: HTML の特殊文字をエスケープ', () => {
  assert.equal(escapeHtml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;');
});

test('nutritionSummary: 主要4項目のうち値があるものだけ', () => {
  assert.equal(nutritionSummary({ エネルギー: 700, たんぱく質: 18, 脂質: 20, 炭水化物: 100, 食塩相当量: 3 }),
    'エネルギー 700kcal / たんぱく質 18g / 脂質 20g / 炭水化物 100g');
  assert.equal(nutritionSummary({ エネルギー: 400 }), 'エネルギー 400kcal');
  assert.equal(nutritionSummary(undefined), '');
});

test('buildDigestEmail: 件名は日付と重複を除いた品数', () => {
  const { subject } = buildDigestEmail(params);
  assert.equal(subject, '【共和食堂】10/16(金) 通知ルールに合うメニューがあります（2品）');
});

test('buildDigestEmail: テキスト本文にルール・条件・メニュー・リンクを含む', () => {
  const { text } = buildDigestEmail(params);
  assert.match(text, /■ カレーの日\n {2}条件: 「カレー」のいずれかを含む\n {2}・カレーライス（エネルギー 700kcal/);
  assert.match(text, /・カレーライスミニ（エネルギー 400kcal）/);
  assert.ok(text.includes('通知メールを停止する: https://example.com/app/unsubscribe.html?token=abc'));
  assert.ok(text.includes('通知設定を変更する: https://example.com/app/notify.html'));
});

test('buildDigestEmail: HTML 本文はルール名などをエスケープする', () => {
  const { html } = buildDigestEmail(params);
  assert.ok(html.includes('&lt;高たんぱく&gt;'));
  assert.ok(!html.includes('<高たんぱく>'));
  assert.ok(html.includes('href="https://example.com/app/unsubscribe.html?token=abc"'));
});
