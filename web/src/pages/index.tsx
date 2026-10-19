import { useEffect, useMemo, useState } from 'react';
import { ChartColumn, ListChecks, SlidersHorizontal, Sparkles } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { AITab } from '../components/main/AITab.tsx';
import { MenusTab } from '../components/main/MenusTab.tsx';
import { ResultTab } from '../components/main/ResultTab.tsx';
import { SettingsTab } from '../components/main/SettingsTab.tsx';
import { TabBar, type TabItem } from '../components/TabBar.tsx';
import { useAsync } from '../hooks/useAsync.ts';
import { fetchAISelection, fetchAvailableDates, fetchMenus } from '../lib/api.ts';
import { formatDateLabel, pickDefaultDate, todayInTokyo, type ISODate } from '../lib/date.ts';
import { fixedOnlyResult, optimizeMenus, type OptimizeResult } from '../lib/optimizer.ts';
import { renderPage } from '../lib/render.tsx';
import { SETTINGS_STORAGE_KEY, activeTargets, parseSettings, serializeSettings, type Settings } from '../lib/settings.ts';

type MainTab = 'settings' | 'menus' | 'result' | 'ai';

const TABS: TabItem<MainTab>[] = [
  { id: 'settings', label: '設定', icon: SlidersHorizontal },
  { id: 'menus', label: 'メニュー', icon: ListChecks },
  { id: 'result', label: '結果', icon: ChartColumn },
  { id: 'ai', label: 'AI', icon: Sparkles },
];

const panelId = (id: MainTab) => `panel-${id}`;

function loadSettings(): Settings {
  try {
    return parseSettings(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {
    return parseSettings(null);
  }
}

interface Picks {
  fixed: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
}

const EMPTY_PICKS: Picks = { fixed: new Set(), excluded: new Set() };

/** Set に入れる / 外す（元の Set は変えない） */
function toggled<T>(set: ReadonlySet<T>, value: T, on: boolean): Set<T> {
  const next = new Set(set);
  if (on) next.add(value);
  else next.delete(value);
  return next;
}

function MainPage() {
  const [tab, setTab] = useState<MainTab>('settings');
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [today] = useState(() => todayInTokyo());

  const [date, setDate] = useState<ISODate | null>(null);
  // 固定と除外は片方を変えるともう片方も変わるので、1つの状態として持つ
  const [picks, setPicks] = useState<Picks>(EMPTY_PICKS);
  const { fixed, excluded } = picks;
  const [result, setResult] = useState<OptimizeResult | null>(null);
  const [dropped, setDropped] = useState<ReadonlySet<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);

  const dates = useAsync(fetchAvailableDates, []);
  const menus = useAsync(date ? () => fetchMenus(date) : null, [date]);
  const aiSelection = useAsync(date ? () => fetchAISelection(date) : null, [date]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_STORAGE_KEY, serializeSettings(settings));
    } catch {
      // 保存できなくても、この画面の間は設定を使える
    }
  }, [settings]);

  // 日付の一覧が読めたら、今日以降で最初の日を選ぶ
  useEffect(() => {
    if (dates.state.status === 'success' && date === null) {
      setDate(pickDefaultDate(dates.state.data, today) ?? dates.state.data[0] ?? null);
    }
  }, [dates.state, date, today]);

  const changeDate = (next: ISODate) => {
    setDate(next);
    setPicks(EMPTY_PICKS);
    setResult(null);
    setDropped(new Set());
    setNotice(null);
  };

  const targets = useMemo(() => activeTargets(settings), [settings]);
  const menuList = menus.state.status === 'success' ? menus.state.data : [];
  const menuNames = useMemo(() => new Set(menuList.map((m) => m.name)), [menuList]);

  const openResult = (next: OptimizeResult) => {
    setResult(next);
    setDropped(new Set());
    setNotice(null);
    setTab('result');
  };

  const optimize = (extraExcluded: ReadonlySet<string> = new Set()) => {
    if (Object.keys(targets).length === 0) {
      setNotice('栄養目標を1つ以上有効にしてください（設定のタブ）。');
      return;
    }
    if (menuList.length === 0) {
      setNotice('この日のメニューがまだ読み込めていません。');
      return;
    }
    openResult(
      optimizeMenus({
        menus: menuList,
        targets,
        fixedNames: fixed,
        excludedNames: [...excluded, ...extraExcluded],
        maxAdditional: settings.maxAdditional,
      }),
    );
  };

  const showFixedOnly = () => {
    if (fixed.size === 0) {
      setNotice('固定したメニューがありません。スイッチで1つ以上固定してください。');
      return;
    }
    openResult(fixedOnlyResult(menuList, targets, fixed));
  };

  // 行を押す: 固定中なら固定をやめて除外、それ以外は除外の切り替え
  const pressRow = (name: string) =>
    setPicks((p) =>
      p.fixed.has(name)
        ? { fixed: toggled(p.fixed, name, false), excluded: toggled(p.excluded, name, true) }
        : { ...p, excluded: toggled(p.excluded, name, !p.excluded.has(name)) },
    );

  // 固定すると除外は外れる
  const changeFixed = (name: string, on: boolean) =>
    setPicks((p) => ({ fixed: toggled(p.fixed, name, on), excluded: on ? toggled(p.excluded, name, false) : p.excluded }));

  const fixAISet = (names: string[]) => {
    setPicks((p) => ({ fixed: new Set(names), excluded: new Set([...p.excluded].filter((n) => !names.includes(n))) }));
    setNotice(null);
    setTab('menus');
  };

  return (
    <AppShell current="index" hasBottomBar>
      <h1 className="sr-only">メニュー最適化</h1>
      <TabBar tabs={TABS} value={tab} onChange={setTab} panelId={panelId} label="メニュー最適化の画面" />
      {date && tab !== 'settings' && (
        <p className="mb-3 text-sm text-fg-muted">
          {formatDateLabel(date)}
          {date === today ? '（今日）' : ''}のメニュー
        </p>
      )}
      <section role="tabpanel" id={panelId(tab)} aria-labelledby={`tab-${tab}`}>
        {tab === 'settings' && (
          <SettingsTab
            dates={dates.state}
            onReloadDates={dates.reload}
            date={date}
            today={today}
            onDateChange={changeDate}
            settings={settings}
            onSettingsChange={setSettings}
            onNext={() => setTab('menus')}
          />
        )}
        {tab === 'menus' && (
          <MenusTab
            menus={date ? menus.state : { status: 'success', data: [] }}
            onReloadMenus={menus.reload}
            aiSelection={aiSelection.state.status === 'success' ? aiSelection.state.data : null}
            targets={targets}
            fixed={fixed}
            excluded={excluded}
            onRowPress={pressRow}
            onFixedChange={changeFixed}
            onOptimize={() => optimize()}
            onShowFixedOnly={showFixedOnly}
            notice={notice}
          />
        )}
        {tab === 'result' && (
          <ResultTab
            result={result}
            dropped={dropped}
            onToggleDrop={(name) => setDropped((current) => toggled(current, name, !current.has(name)))}
            onReoptimize={() => optimize(dropped)}
            onBack={() => setTab('settings')}
            onGoToMenus={() => setTab('menus')}
          />
        )}
        {tab === 'ai' && (
          <AITab
            selection={date ? aiSelection.state : { status: 'success', data: null }}
            onReload={aiSelection.reload}
            targets={targets}
            availableNames={menuNames}
            onFixSet={fixAISet}
          />
        )}
      </section>
    </AppShell>
  );
}

renderPage(<MainPage />);
