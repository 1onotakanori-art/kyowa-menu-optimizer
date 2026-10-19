import { useCallback, useEffect, useState } from 'react';
import {
  THEME_STORAGE_KEY,
  parseThemePreference,
  resolveTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '../lib/theme.ts';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function readPreference(): ThemePreference {
  try {
    return parseThemePreference(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return 'system';
  }
}

function applyTheme(theme: ResolvedTheme) {
  document.documentElement.dataset.theme = theme;
}

/** テーマの選択値を持ち、OS の設定の変化にも追従して <html data-theme> を更新する */
export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference);

  useEffect(() => {
    const media = window.matchMedia(DARK_QUERY);
    const update = () => applyTheme(resolveTheme(preference, media.matches));
    update();
    if (preference !== 'system') return;
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [preference]);

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // 保存できなくても、この画面の間は選んだテーマで表示する
    }
  }, []);

  return { preference, setPreference };
}
