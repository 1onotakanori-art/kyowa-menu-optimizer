import { useRef, type KeyboardEvent } from 'react';
import type { LucideIcon } from 'lucide-react';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon: LucideIcon;
}

interface TabBarProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  /** 各タブが操作するパネルの id を返す（aria-controls に使う） */
  panelId: (id: T) => string;
  label: string;
}

/**
 * ページ内のタブ切り替え。
 * モバイルでは画面下に固定したタブバー（片手で届く位置）、広い画面では本文の上に並ぶタブとして表示する。
 * キーボードでは左右の矢印キーと Home / End で移動できる（WAI-ARIA の Tabs パターン）。
 */
export function TabBar<T extends string>({ tabs, value, onChange, panelId, label }: TabBarProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const target =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (target === null) return;
    event.preventDefault();
    onChange(tabs[target].id);
    refs.current[target]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={label}
      className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col auto-cols-fr border-t border-border bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:static sm:z-auto sm:mb-6 sm:rounded-xl sm:border sm:bg-surface-muted sm:p-1 sm:pb-1 sm:backdrop-blur-none"
    >
      {tabs.map(({ id, label: tabLabel, icon: Icon }, index) => {
        const selected = id === value;
        return (
          <button
            key={id}
            ref={(el) => {
              refs.current[index] = el;
            }}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={selected}
            aria-controls={panelId(id)}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors sm:min-h-10 sm:flex-row sm:gap-2 sm:rounded-lg sm:text-sm ${
              selected ? 'text-accent sm:bg-surface sm:text-fg sm:shadow-sm' : 'text-fg-muted hover:text-fg'
            }`}
          >
            <Icon className="size-5 sm:size-4" aria-hidden="true" />
            {tabLabel}
          </button>
        );
      })}
    </div>
  );
}
