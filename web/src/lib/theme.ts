/**
 * テーマ（ライト / ダーク）の選択と解決
 *
 * 利用者が選べるのは light / dark / system の3つ。system は OS の設定に従う。
 * 選んだ値は localStorage に保存し、画面に適用するのは解決後の light / dark。
 *
 * 初回描画時のちらつきを防ぐため、同じ解決ロジックを public/theme-init.js にも持っている。
 * ここを変えたら theme-init.js も合わせること。
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'kyowa-theme';

export const THEME_PREFERENCES: readonly ThemePreference[] = ['light', 'dark', 'system'];

/** 保存値を検証する。壊れた値や未保存なら system として扱う */
export function parseThemePreference(value: unknown): ThemePreference {
  return THEME_PREFERENCES.includes(value as ThemePreference) ? (value as ThemePreference) : 'system';
}

/** 選択値と OS の設定から、実際に適用するテーマを決める */
export function resolveTheme(preference: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark ? 'dark' : 'light';
  return preference;
}
