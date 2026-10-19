import type { ReactNode } from 'react';
import { UtensilsCrossed } from 'lucide-react';
import { NAV_ITEMS, type PageId } from '../lib/pages.ts';
import { ThemeToggle } from './ThemeToggle.tsx';

interface AppShellProps {
  current: PageId;
  children: ReactNode;
  /** モバイルで画面下に固定するタブバーがあるページは true（本文の下に余白を取る） */
  hasBottomBar?: boolean;
}

/** 全ページ共通の枠（ヘッダー、ナビゲーション、本文の幅） */
export function AppShell({ current, children, hasBottomBar = false }: AppShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50"
      >
        本文へ移動
      </a>

      <header className="sticky top-0 z-30 border-b border-border bg-bg/85 pt-[env(safe-area-inset-top)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-4">
          <a href="/" className="mr-auto flex min-w-0 items-center gap-2 rounded-md font-semibold tracking-tight">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-fg text-bg">
              <UtensilsCrossed className="size-4" aria-hidden="true" />
            </span>
            <span className="truncate">共和食堂メニュー</span>
          </a>

          <nav aria-label="ページ" className="flex items-center">
            {NAV_ITEMS.filter((item) => item.id !== 'index').map(({ id, label, href, icon: Icon }) => {
              const active = id === current;
              return (
                <a
                  key={id}
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  aria-label={label}
                  title={label}
                  className={`flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm transition-colors sm:h-9 ${
                    active ? 'bg-surface-muted text-fg' : 'text-fg-muted hover:bg-surface-muted hover:text-fg'
                  }`}
                >
                  <Icon className="size-5 sm:size-4" aria-hidden="true" />
                  <span className="hidden sm:inline">{label}</span>
                </a>
              );
            })}
          </nav>

          <ThemeToggle />
        </div>
      </header>

      <main
        id="main"
        className={`mx-auto w-full max-w-3xl flex-1 px-4 py-6 ${
          hasBottomBar ? 'pb-[calc(5rem+env(safe-area-inset-bottom))] sm:pb-10' : 'pb-10'
        }`}
      >
        {children}
      </main>
    </div>
  );
}
