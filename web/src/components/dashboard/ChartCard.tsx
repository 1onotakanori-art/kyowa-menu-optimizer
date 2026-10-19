import type { ReactNode } from 'react';
import { Table2 } from 'lucide-react';

interface ChartCardProps {
  title: string;
  caption?: ReactNode;
  /** タイトルの右に置く操作（切り替えボタンなど） */
  action?: ReactNode;
  children: ReactNode;
  /** 同じ値を表で見るための表（ツールチップだけに頼らないため、どのグラフにも付ける） */
  table: { head: string[]; rows: (string | number)[][] };
}

/** グラフの入れ物。タイトル・説明・グラフ本体・「表で見る」 */
export function ChartCard({ title, caption, action, children, table }: ChartCardProps) {
  return (
    <figure className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-start gap-2">
        <figcaption className="mr-auto">
          <span className="block text-sm font-semibold">{title}</span>
          {caption && <span className="block text-xs text-fg-muted">{caption}</span>}
        </figcaption>
        {action}
      </div>
      {children}
      <details className="mt-3 border-t border-border pt-2 text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 text-fg-muted hover:text-fg">
          <Table2 className="size-4" aria-hidden="true" />
          表で見る
        </summary>
        <div className="max-h-72 overflow-auto">
          <table className="w-full tabular-nums">
            <thead className="sticky top-0 bg-surface text-xs text-fg-muted">
              <tr>
                {table.head.map((h, i) => (
                  <th key={h} scope="col" className={`py-1.5 font-medium ${i === 0 ? 'text-left' : 'text-right'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row) => (
                <tr key={String(row[0])} className="border-t border-border">
                  {row.map((cell, i) =>
                    i === 0 ? (
                      <th key={i} scope="row" className="py-1.5 text-left font-normal">
                        {cell}
                      </th>
                    ) : (
                      <td key={i} className="py-1.5 text-right">
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}

/** グラフのツールチップ。値を先に太字で、名前は控えめに */
export function ChartTooltip({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
      <div className="flex items-baseline gap-1">
        <span className="text-sm font-semibold text-fg tabular-nums">{value}</span>
        {unit && <span className="text-fg-muted">{unit}</span>}
      </div>
      <div className="text-fg-muted">{label}</div>
    </div>
  );
}
