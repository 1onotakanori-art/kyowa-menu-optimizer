import { useId, useMemo, useState } from 'react';
import { Ban, ChartColumn, Pin, Search, SearchX, Sparkles, Wand2, X } from 'lucide-react';
import type { AsyncState } from '../../hooks/useAsync.ts';
import type { AISelection } from '../../lib/mappers.ts';
import { sumNutrition, type Menu, type Targets } from '../../lib/nutrition.ts';
import { EmptyState } from '../EmptyState.tsx';
import { MenuNutritionLine, NutritionSummary } from '../Nutrition.tsx';
import { Badge, Button, ErrorMessage, Loading, Switch } from '../ui.tsx';

interface MenusTabProps {
  menus: AsyncState<Menu[]>;
  onReloadMenus: () => void;
  aiSelection: AISelection | null;
  targets: Targets;
  fixed: ReadonlySet<string>;
  excluded: ReadonlySet<string>;
  onRowPress: (name: string) => void;
  onFixedChange: (name: string, fixed: boolean) => void;
  onOptimize: () => void;
  onShowFixedOnly: () => void;
  notice: string | null;
}

export function MenusTab(props: MenusTabProps) {
  const { menus, onReloadMenus, aiSelection, targets, fixed, excluded, onRowPress, onFixedChange, onOptimize, onShowFixedOnly, notice } = props;
  const [query, setQuery] = useState('');
  const searchId = useId();

  const allMenus = menus.status === 'success' ? menus.data : [];
  const fixedMenus = useMemo(() => allMenus.filter((m) => fixed.has(m.name)), [allMenus, fixed]);
  const aiNames = useMemo(() => new Set(aiSelection?.menus.map((m) => m.name)), [aiSelection]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? allMenus.filter((m) => m.name.toLowerCase().includes(q)) : allMenus;
  }, [allMenus, query]);

  if (menus.status === 'loading') return <Loading>メニューを読み込んでいます</Loading>;
  if (menus.status === 'error') return <ErrorMessage onRetry={onReloadMenus}>{menus.error.message}</ErrorMessage>;

  return (
    <div className="space-y-4">
      <div className="sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 space-y-2 border-b border-border bg-bg/90 px-4 pt-1 pb-3 backdrop-blur-md sm:mx-0 sm:rounded-b-xl sm:border-x sm:px-3">
        <NutritionSummary totals={sumNutrition(fixedMenus)} targets={targets} count={fixedMenus.length} label="固定したメニューの合計" />
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <Button variant="primary" icon={Wand2} onClick={onOptimize}>
            最適化する
          </Button>
          <Button icon={ChartColumn} onClick={onShowFixedOnly}>
            固定だけで集計
          </Button>
        </div>
        <p aria-live="polite" className="text-xs text-danger empty:hidden">
          {notice}
        </p>
      </div>

      <div className="relative">
        <label htmlFor={searchId} className="sr-only">
          メニュー名で絞り込む
        </label>
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-fg-muted" aria-hidden="true" />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="メニュー名で絞り込む"
          className="h-11 w-full rounded-lg border border-border-strong bg-surface pr-11 pl-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="絞り込みを解除"
            className="absolute top-0 right-0 grid size-11 place-items-center text-fg-muted hover:text-fg"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="text-xs text-fg-muted">
        {allMenus.length}品 ・ 固定 {fixed.size} ・ 除外 {excluded.size}
        <span className="block">メニューを押すと最適化の候補から外します（もう一度押すと戻します）。必ず入れたいものはスイッチで固定します。</span>
      </p>

      {allMenus.length === 0 ? (
        <EmptyState icon={SearchX} title="この日のメニューはありません" />
      ) : visible.length === 0 ? (
        <EmptyState icon={SearchX} title="該当するメニューがありません">
          「{query}」を含むメニューはありません。
        </EmptyState>
      ) : (
        <ul className="space-y-2">
          {visible.map((menu) => (
            <MenuRow
              key={menu.name}
              menu={menu}
              isFixed={fixed.has(menu.name)}
              isExcluded={excluded.has(menu.name)}
              isAI={aiNames.has(menu.name)}
              onPress={() => onRowPress(menu.name)}
              onFixedChange={(value) => onFixedChange(menu.name, value)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface MenuRowProps {
  menu: Menu;
  isFixed: boolean;
  isExcluded: boolean;
  isAI: boolean;
  onPress: () => void;
  onFixedChange: (fixed: boolean) => void;
}

function MenuRow({ menu, isFixed, isExcluded, isAI, onPress, onFixedChange }: MenuRowProps) {
  return (
    <li
      className={`flex items-stretch overflow-hidden rounded-xl border transition-colors ${
        isFixed ? 'border-accent bg-accent-subtle' : isExcluded ? 'border-border bg-surface-muted' : 'border-border bg-surface'
      }`}
    >
      <button
        type="button"
        onClick={onPress}
        aria-pressed={isExcluded}
        className="min-w-0 flex-1 px-3 py-2.5 text-left"
      >
        <span className="mb-1 flex flex-wrap items-center gap-1.5">
          <span className={`font-medium ${isExcluded ? 'text-fg-muted line-through' : ''}`}>{menu.name}</span>
          {isFixed && (
            <Badge tone="accent" icon={Pin}>
              固定
            </Badge>
          )}
          {isExcluded && (
            <Badge tone="neutral" icon={Ban}>
              除外
            </Badge>
          )}
          {isAI && (
            <Badge tone="info" icon={Sparkles}>
              AI 推奨
            </Badge>
          )}
        </span>
        <span className={isExcluded ? 'opacity-60' : ''}>
          <MenuNutritionLine nutrition={menu.nutrition} />
        </span>
        <span className="sr-only">
          {isExcluded ? '除外中。押すと候補に戻します' : isFixed ? '固定中。押すと固定をやめて除外します' : '押すと除外します'}
        </span>
      </button>
      <div className="flex items-center border-l border-border px-2">
        <Switch checked={isFixed} onChange={onFixedChange} label={`${menu.name}を固定`} hideLabel />
      </div>
    </li>
  );
}
