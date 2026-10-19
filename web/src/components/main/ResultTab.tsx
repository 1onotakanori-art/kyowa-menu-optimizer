import { ArrowLeft, ChartColumn, ListChecks, Pin, Plus, RefreshCw, Target, Undo2 } from 'lucide-react';
import type { Menu } from '../../lib/nutrition.ts';
import type { OptimizeResult } from '../../lib/optimizer.ts';
import { EmptyState } from '../EmptyState.tsx';
import { MenuNutritionLine, NutritionSummary, TargetTable } from '../Nutrition.tsx';
import { Badge, Button, Card } from '../ui.tsx';

interface ResultTabProps {
  result: OptimizeResult | null;
  /** 結果から外して選び直す予定のメニュー */
  dropped: ReadonlySet<string>;
  onToggleDrop: (name: string) => void;
  onReoptimize: () => void;
  onBack: () => void;
  onGoToMenus: () => void;
}

export function ResultTab({ result, dropped, onToggleDrop, onReoptimize, onBack, onGoToMenus }: ResultTabProps) {
  if (!result) {
    return (
      <EmptyState icon={ChartColumn} title="まだ結果がありません">
        <p>メニューのタブで「最適化する」を押すと、ここに結果が出ます。</p>
        <Button variant="primary" icon={ListChecks} onClick={onGoToMenus} className="mt-4">
          メニューを選ぶ
        </Button>
      </EmptyState>
    );
  }

  const hasTargets = Object.keys(result.targets).length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-lg font-semibold tracking-tight">{result.selectedMenus.length}品の組み合わせ</p>
        </div>
        {hasTargets && (
          <p className="text-right text-sm">
            <span className="text-fg-muted">目標とのずれ </span>
            <span className="text-lg font-semibold tabular-nums">{result.distance.toFixed(2)}</span>
            <span className="block text-xs text-fg-muted">0 に近いほど目標どおり</span>
          </p>
        )}
      </div>

      <NutritionSummary totals={result.totalNutrition} targets={result.targets} count={result.selectedMenus.length} label="組み合わせの合計" />

      {hasTargets && (
        <Card title="目標との比較" icon={Target}>
          <TargetTable totals={result.totalNutrition} targets={result.targets} />
        </Card>
      )}

      {result.fixedMenus.length > 0 && (
        <Card title={`固定したメニュー（${result.fixedMenus.length}品）`} icon={Pin}>
          <ul className="space-y-2">
            {result.fixedMenus.map((menu) => (
              <li key={menu.name} className="rounded-lg border border-border px-3 py-2.5">
                <p className="mb-1 font-medium">{menu.name}</p>
                <MenuNutritionLine nutrition={menu.nutrition} />
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={`追加したメニュー（${result.additionalMenus.length}品）`} icon={Plus}>
        {result.additionalMenus.length === 0 ? (
          <p className="text-sm text-fg-muted">
            {result.fixedMenus.length > 0 ? '固定したメニューだけの集計です。' : '目標に近づくメニューが見つかりませんでした。'}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {result.additionalMenus.map((menu) => (
                <AdditionalRow key={menu.name} menu={menu} isDropped={dropped.has(menu.name)} onToggle={() => onToggleDrop(menu.name)} />
              ))}
            </ul>
            <p className="mt-3 text-xs text-fg-muted">外したいメニューを押してから「選び直す」を押すと、それ以外で組み合わせを作り直します。</p>
          </>
        )}
      </Card>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="primary" icon={RefreshCw} onClick={onReoptimize}>
          {dropped.size > 0 ? `${dropped.size}品を外して選び直す` : '選び直す'}
        </Button>
        <Button icon={ArrowLeft} onClick={onBack}>
          設定に戻る
        </Button>
      </div>
    </div>
  );
}

function AdditionalRow({ menu, isDropped, onToggle }: { menu: Menu; isDropped: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={isDropped}
        className={`w-full rounded-lg border px-3 py-2.5 text-left transition-colors ${
          isDropped ? 'border-border bg-surface-muted' : 'border-border hover:bg-surface-muted'
        }`}
      >
        <span className="mb-1 flex items-center gap-1.5">
          <span className={`font-medium ${isDropped ? 'text-fg-muted line-through' : ''}`}>{menu.name}</span>
          {isDropped && (
            <Badge icon={Undo2}>外す</Badge>
          )}
        </span>
        <span className={isDropped ? 'opacity-60' : ''}>
          <MenuNutritionLine nutrition={menu.nutrition} />
        </span>
        <span className="sr-only">{isDropped ? '選び直すときに外します。押すと元に戻します' : '押すと、選び直すときに外します'}</span>
      </button>
    </li>
  );
}
