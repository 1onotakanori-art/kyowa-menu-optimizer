import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { useTheme } from '../hooks/useTheme.ts';
import { THEME_PREFERENCES, type ThemePreference } from '../lib/theme.ts';

const OPTIONS: Record<ThemePreference, { label: string; icon: LucideIcon }> = {
  light: { label: 'ライト', icon: Sun },
  dark: { label: 'ダーク', icon: Moon },
  system: { label: '端末の設定に合わせる', icon: Monitor },
};

/**
 * ライト / ダーク / 端末の設定 の切り替え。
 * 幅の狭い画面では押すたびに順に切り替わるボタン1つ、広い画面では3つ並べて表示する。
 * アイコンだけのボタンなので aria-label と title を必ず付ける。
 */
export function ThemeToggle() {
  const { preference, setPreference } = useTheme();
  const current = OPTIONS[preference];
  const next = THEME_PREFERENCES[(THEME_PREFERENCES.indexOf(preference) + 1) % THEME_PREFERENCES.length];
  const CurrentIcon = current.icon;

  return (
    <>
      <button
        type="button"
        onClick={() => setPreference(next)}
        aria-label={`表示テーマ: ${current.label}（押すと「${OPTIONS[next].label}」に切り替え）`}
        title={`表示テーマ: ${current.label}`}
        className="grid size-11 place-items-center rounded-lg text-fg-muted transition-colors hover:bg-surface-muted hover:text-fg sm:hidden"
      >
        <CurrentIcon className="size-5" aria-hidden="true" />
      </button>

      <div
        role="group"
        aria-label="表示テーマ"
        className="hidden items-center rounded-lg border border-border bg-surface-muted p-0.5 sm:flex"
      >
        {THEME_PREFERENCES.map((value) => {
          const { label, icon: Icon } = OPTIONS[value];
          const selected = preference === value;
          return (
            <button
              key={value}
              type="button"
              aria-pressed={selected}
              aria-label={label}
              title={label}
              onClick={() => setPreference(value)}
              className={`grid size-9 place-items-center rounded-md transition-colors ${
                selected ? 'bg-surface text-fg shadow-sm' : 'text-fg-muted hover:text-fg'
              }`}
            >
              <Icon className="size-4" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </>
  );
}
