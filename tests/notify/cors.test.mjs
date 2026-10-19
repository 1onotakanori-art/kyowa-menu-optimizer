import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEFAULT_ALLOWED_ORIGINS, corsHeaders, isAllowedOrigin, parseAllowedOrigins } from '../../supabase/functions/_shared/cors.js';

test('parseAllowedOrigins: カンマ区切りを分け、末尾の / を取る。未設定なら初期値', () => {
  assert.deepEqual(parseAllowedOrigins(' https://a.example/ , https://b.example '), ['https://a.example', 'https://b.example']);
  assert.deepEqual(parseAllowedOrigins(undefined), [...DEFAULT_ALLOWED_ORIGINS]);
  assert.deepEqual(parseAllowedOrigins(' , '), [...DEFAULT_ALLOWED_ORIGINS]);
});

test('isAllowedOrigin: GitHub Pages・Vercel の本番とこのプロジェクトのプレビューだけ', () => {
  const allowed = parseAllowedOrigins(undefined);
  assert.ok(isAllowedOrigin('https://kyowa-menu-optimizer.vercel.app', allowed));
  assert.ok(isAllowedOrigin('https://1onotakanori-art.github.io', allowed));
  assert.ok(isAllowedOrigin('https://kyowa-menu-optimizer-takanoris-projects-ff756f89.vercel.app', allowed));
  assert.ok(isAllowedOrigin('https://kyowa-menu-optimizer-h9otpatya-takanoris-projects-ff756f89.vercel.app', allowed));
  assert.ok(isAllowedOrigin('https://kyowa-menu-optimizer-git-claude-x-takanoris-projects-ff756f89.vercel.app', allowed));
  assert.equal(isAllowedOrigin('https://evil.example', allowed), false);
  assert.equal(isAllowedOrigin('http://1onotakanori-art.github.io', allowed), false);
  assert.equal(isAllowedOrigin('https://kyowa-menu-optimizer-x-takanoris-projects-ff756f89.vercel.app.evil.example', allowed), false);
  assert.equal(isAllowedOrigin(null, allowed), false);
});

test('corsHeaders: 許可したサイトにだけ Access-Control-Allow-Origin を付ける', () => {
  const allowed = parseAllowedOrigins(undefined);
  assert.equal(corsHeaders('https://1onotakanori-art.github.io', allowed)['Access-Control-Allow-Origin'], 'https://1onotakanori-art.github.io');
  assert.equal('Access-Control-Allow-Origin' in corsHeaders('https://evil.example', allowed), false);
  assert.equal(corsHeaders(null, allowed).Vary, 'Origin');
});
