import { Construction, type LucideIcon } from 'lucide-react';
import type { PageId } from '../lib/pages.ts';
import { AppShell } from './AppShell.tsx';
import { EmptyState } from './EmptyState.tsx';

interface PlaceholderPageProps {
  current: PageId;
  title: string;
  icon: LucideIcon;
  description: string;
}

/** 作り直し中のページ。見出しと「準備中」の表示だけを出す */
export function PlaceholderPage({ current, title, icon: Icon, description }: PlaceholderPageProps) {
  return (
    <AppShell current={current}>
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <Icon className="size-5 text-fg-muted" aria-hidden="true" />
        {title}
      </h1>
      <p className="mb-6 text-sm text-fg-muted">{description}</p>
      <EmptyState icon={Construction} title="この画面は準備中です">
        新しいデザインで作り直しています。今の画面は GitHub Pages 版をお使いください。
      </EmptyState>
    </AppShell>
  );
}
