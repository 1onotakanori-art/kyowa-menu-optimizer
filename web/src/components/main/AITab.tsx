import { Inbox, Info, Lightbulb, MessageSquareQuote, Pin, Sparkles } from 'lucide-react';
import type { AsyncState } from '../../hooks/useAsync.ts';
import type { AISelection } from '../../lib/mappers.ts';
import { roundTenth, sumNutrition, type Targets } from '../../lib/nutrition.ts';
import { EmptyState } from '../EmptyState.tsx';
import { MenuNutritionLine, NutritionSummary } from '../Nutrition.tsx';
import { Badge, Button, Card, ErrorMessage, Loading } from '../ui.tsx';

interface AITabProps {
  selection: AsyncState<AISelection | null>;
  onReload: () => void;
  targets: Targets;
  /** その日のメニューにある名前（固定できるかの判定に使う） */
  availableNames: ReadonlySet<string>;
  onFixSet: (names: string[]) => void;
}

export function AITab({ selection, onReload, targets, availableNames, onFixSet }: AITabProps) {
  if (selection.status === 'loading') return <Loading>AI 推奨を読み込んでいます</Loading>;
  if (selection.status === 'error') return <ErrorMessage onRetry={onReload}>{selection.error.message}</ErrorMessage>;
  if (!selection.data || selection.data.menus.length === 0) {
    return (
      <EmptyState icon={Inbox} title="この日の AI 推奨はまだありません">
        AI 推奨は毎週の更新で作られます。
      </EmptyState>
    );
  }

  const { menus, setComment, setReason } = selection.data;
  const totals = sumNutrition(menus);
  const fixable = menus.map((m) => m.name).filter((name) => availableNames.has(name));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm text-fg-muted">
            <Sparkles className="size-4" aria-hidden="true" />
            過去の食事記録から選んだセット
          </p>
          <p className="text-lg font-semibold tracking-tight">
            {menus.length}品 ・ {Math.round(totals['エネルギー'] ?? 0)} kcal
          </p>
        </div>
        <Button icon={Pin} onClick={() => onFixSet(fixable)} disabled={fixable.length === 0}>
          このセットを固定する
        </Button>
      </div>

      <NutritionSummary totals={totals} targets={targets} count={menus.length} label="AI 推奨セットの合計" />

      {setComment && (
        <Card title="ひとこと解説" icon={MessageSquareQuote}>
          <p className="text-sm leading-relaxed">{setComment}</p>
        </Card>
      )}

      <ol className="space-y-2">
        {menus.map((menu, index) => (
          <li key={menu.name} className="flex gap-3 rounded-xl border border-border bg-surface px-3 py-2.5">
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-surface-muted text-xs font-semibold tabular-nums" aria-hidden="true">
              {index + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="mb-1 flex flex-wrap items-center gap-1.5">
                {menu.roleLabel && <Badge>{menu.roleLabel}</Badge>}
                <span className="font-medium">{menu.name}</span>
                <span className="text-xs text-fg-muted tabular-nums">スコア {roundTenth(menu.score * 100)}%</span>
              </p>
              <MenuNutritionLine nutrition={menu.nutrition} />
              {menu.reasons.length > 0 && (
                <p className="mt-1.5 flex items-start gap-1.5 text-xs text-fg-muted">
                  <Lightbulb className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  {menu.reasons.join(' / ')}
                </p>
              )}
            </div>
          </li>
        ))}
      </ol>

      {setReason && (
        <Card title="このセットを選んだ理由" icon={Info}>
          <p className="text-sm leading-relaxed text-fg-muted">{setReason}</p>
        </Card>
      )}
    </div>
  );
}
