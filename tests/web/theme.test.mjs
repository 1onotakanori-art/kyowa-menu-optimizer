import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import {
  THEME_PREFERENCES,
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
} from '../../web/src/lib/theme.ts';

test('parseThemePreference: 保存できる3つの値はそのまま、それ以外は system', () => {
  for (const value of THEME_PREFERENCES) assert.equal(parseThemePreference(value), value);
  assert.equal(parseThemePreference(null), 'system');
  assert.equal(parseThemePreference('DARK'), 'system');
  assert.equal(parseThemePreference(1), 'system');
});

test('resolveTheme: system は OS の設定に従い、light / dark は OS の設定に関係なく固定', () => {
  assert.equal(resolveTheme('system', true), 'dark');
  assert.equal(resolveTheme('system', false), 'light');
  assert.equal(resolveTheme('light', true), 'light');
  assert.equal(resolveTheme('dark', false), 'dark');
});

/** public/theme-init.js をブラウザ代わりの環境で実行し、<html data-theme> に入った値を返す */
function runThemeInit({ saved, systemDark, storageThrows = false }) {
  const source = readFileSync(new URL('../../web/public/theme-init.js', import.meta.url), 'utf8');
  const documentElement = { dataset: {} };
  const context = {
    document: { documentElement },
    localStorage: {
      getItem(key) {
        if (storageThrows) throw new Error('blocked');
        return key === THEME_STORAGE_KEY ? saved : null;
      },
    },
    window: { matchMedia: () => ({ matches: systemDark }) },
  };
  vm.runInNewContext(source, context);
  return documentElement.dataset.theme;
}

test('theme-init.js: theme.ts と同じ結果になる（初回描画のちらつき防止用の複製）', () => {
  for (const saved of [...THEME_PREFERENCES, null, 'broken']) {
    for (const systemDark of [true, false]) {
      assert.equal(
        runThemeInit({ saved, systemDark }),
        resolveTheme(parseThemePreference(saved), systemDark),
        `saved=${saved} systemDark=${systemDark}`,
      );
    }
  }
});

test('theme-init.js: localStorage が使えなくても OS の設定で決まる', () => {
  assert.equal(runThemeInit({ saved: 'light', systemDark: true, storageThrows: true }), 'dark');
  assert.equal(runThemeInit({ saved: 'dark', systemDark: false, storageThrows: true }), 'light');
});
