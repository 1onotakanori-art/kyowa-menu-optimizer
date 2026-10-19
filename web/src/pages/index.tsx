import { useState } from 'react';
import { ChartColumn, Construction, ListChecks, SlidersHorizontal, Sparkles } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { TabBar, type TabItem } from '../components/TabBar.tsx';
import { renderPage } from '../lib/render.tsx';

type MainTab = 'settings' | 'menus' | 'result' | 'ai';

const TABS: TabItem<MainTab>[] = [
  { id: 'settings', label: '設定', icon: SlidersHorizontal },
  { id: 'menus', label: 'メニュー', icon: ListChecks },
  { id: 'result', label: '結果', icon: ChartColumn },
  { id: 'ai', label: 'AI', icon: Sparkles },
];

const panelId = (id: MainTab) => `panel-${id}`;

function MainPage() {
  const [tab, setTab] = useState<MainTab>('settings');
  const current = TABS.find((t) => t.id === tab)!;

  return (
    <AppShell current="index" hasBottomBar>
      <h1 className="sr-only">メニュー最適化</h1>
      <TabBar tabs={TABS} value={tab} onChange={setTab} panelId={panelId} label="メニュー最適化の画面" />
      <section role="tabpanel" id={panelId(tab)} aria-labelledby={`tab-${tab}`}>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold tracking-tight">
          <current.icon className="size-5 text-fg-muted" aria-hidden="true" />
          {current.label}
        </h2>
        <EmptyState icon={Construction} title="この画面は準備中です">
          新しいデザインで作り直しています。今の画面は GitHub Pages 版をお使いください。
        </EmptyState>
      </section>
    </AppShell>
  );
}

renderPage(<MainPage />);
