/**
 * 栄養値の表示（E / P / F / C / V）
 */

import { ArrowDown, ArrowUp, Check, type LucideIcon } from 'lucide-react';
import { TARGET_FIELDS, roundTenth, type NutritionTotals, type NutritionValue, type Targets } from '../lib/nutrition.ts';
import { targetStatus, type TargetStatus } from '../lib/optimizer.ts';

export const STATUS_STYLE: Record<TargetStatus, { label: string; icon: LucideIcon; text: string; bar: string }> = {
  good: { label: '目標どおり', icon: Check, text: 'text-success', bar: 'bg-success' },
  over: { label: '多い', icon: ArrowUp, text: 'text-danger', bar: 'bg-danger' },
  under: { label: '少ない', icon: ArrowDown, text: 'text-warning', bar: 'bg-warning' },
};

function formatSigned(value: number): string {
  const rounded = roundTenth(value);
  return `${rounded > 0 ? '+' : ''}${rounded}`;
}

/** 1品の栄養値を1行で（"E 650  P 30.2 …"）。ボタンの中にも置けるよう span だけで組む */
export function MenuNutritionLine({ nutrition }: { nutrition: Record<string, NutritionValue> }) {
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-fg-muted tabular-nums">
      {TARGET_FIELDS.map((field) => {
        const value = nutrition[field.key];
        return (
          <span key={field.key} className="flex gap-1">
            <span aria-hidden="true">{field.short}</span>
            <span className="sr-only">{field.label}</span>
            <span className="text-fg">{typeof value === 'number' ? roundTenth(value) : '-'}</span>
          </span>
        );
      })}
    </span>
  );
}

interface NutritionSummaryProps {
  totals: NutritionTotals;
  targets?: Targets;
  count: number;
  label: string;
}

/** 合計の一覧。目標がある項目は差と状態も出す */
export function NutritionSummary({ totals, targets = {}, count, label }: NutritionSummaryProps) {
  return (
    <div aria-label={label} className="grid grid-cols-6 gap-1 rounded-xl border border-border bg-surface p-2 text-center tabular-nums">
      {TARGET_FIELDS.map((field) => {
        const total = totals[field.key] ?? 0;
        const target = targets[field.key];
        const status = target !== undefined ? targetStatus(field.key, target, total) : null;
        const style = status ? STATUS_STYLE[status] : null;
        return (
          <div key={field.key} className="min-w-0 rounded-lg px-0.5 py-1">
            <div className="text-[11px] font-medium text-fg-muted" title={field.label}>
              {field.short}
            </div>
            <div className="truncate text-sm font-semibold">{roundTenth(total)}</div>
            <div className={`flex items-center justify-center gap-0.5 truncate text-[11px] ${style ? style.text : 'text-fg-muted'}`}>
              {style && <style.icon className="size-3 shrink-0" aria-hidden="true" />}
              {target !== undefined ? formatSigned(total - target) : '—'}
              {style && <span className="sr-only">（{style.label}）</span>}
            </div>
          </div>
        );
      })}
      <div className="flex flex-col items-center justify-center rounded-lg bg-surface-muted px-0.5 py-1">
        <div className="text-[11px] font-medium text-fg-muted">品数</div>
        <div className="text-sm font-semibold">{count}</div>
      </div>
    </div>
  );
}

/** 目標ごとの達成状況の表（結果タブ） */
export function TargetTable({ totals, targets }: { totals: NutritionTotals; targets: Targets }) {
  const rows = TARGET_FIELDS.filter((field) => targets[field.key] !== undefined);
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm tabular-nums">
        <thead>
          <tr className="text-left text-xs text-fg-muted">
            <th scope="col" className="py-2 pr-2 font-medium">項目</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">目標</th>
            <th scope="col" className="px-2 py-2 text-right font-medium">合計</th>
            <th scope="col" className="w-2/5 py-2 pl-2 font-medium">達成率</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((field) => {
            const target = targets[field.key]!;
            const total = totals[field.key] ?? 0;
            const style = STATUS_STYLE[targetStatus(field.key, target, total)];
            const rate = target > 0 ? (total / target) * 100 : 0;
            return (
              <tr key={field.key} className="border-t border-border">
                <th scope="row" className="py-2.5 pr-2 text-left font-medium">
                  {field.label}
                  <span className="ml-1 text-xs font-normal text-fg-muted">{field.unit}</span>
                </th>
                <td className="px-2 py-2.5 text-right text-fg-muted">{roundTenth(target)}</td>
                <td className="px-2 py-2.5 text-right font-semibold">{roundTenth(total)}</td>
                <td className="py-2.5 pl-2">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-muted" aria-hidden="true">
                      <div className={`h-full rounded-full ${style.bar}`} style={{ width: `${Math.min(rate, 100)}%` }} />
                    </div>
                    <span className={`flex w-20 items-center justify-end gap-1 text-xs ${style.text}`}>
                      <style.icon className="size-3" aria-hidden="true" />
                      {Math.round(rate)}%<span className="sr-only">（{style.label}）</span>
                    </span>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
