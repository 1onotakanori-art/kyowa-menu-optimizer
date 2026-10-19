import { useMemo, useState } from 'react';
import { Inbox, LayoutDashboard } from 'lucide-react';
import { AppShell } from '../components/AppShell.tsx';
import { ChartCard } from '../components/dashboard/ChartCard.tsx';
import { HistogramChart, PfcBar, ScoreTrendChart, TopMenusBars } from '../components/dashboard/Charts.tsx';
import { EmptyState } from '../components/EmptyState.tsx';
import { ErrorMessage, Loading } from '../components/ui.tsx';
import { useAsync } from '../hooks/useAsync.ts';
import { fetchAllAISelections } from '../lib/api.ts';
import {
  PERIODS,
  dailyMeanScores,
  describe,
  filterByPeriod,
  histogram,
  menuValues,
  pfcRatio,
  summarize,
  topMenus,
  type DaySelection,
  type Period,
} from '../lib/dashboard.ts';
import { formatDateLabel, todayInTokyo } from '../lib/date.ts';
import { roundTenth } from '../lib/nutrition.ts';
import { renderPage } from '../lib/render.tsx';

type Distribution = 'score' | 'energy' | 'protein';

const DISTRIBUTIONS: { id: Distribution; label: string; unit: string; size: number }[] = [
  { id: 'score', label: 'スコア', unit: '%', size: 10 },
  { id: 'energy', label: 'エネルギー', unit: 'kcal', size: 100 },
  { id: 'protein', label: 'たんぱく質', unit: 'g', size: 5 },
];

const STAT_ROWS: { key: keyof ReturnType<typeof menuValues>; label: string; unit: string }[] = [
  { key: 'score', label: 'スコア', unit: '%' },
  { key: 'energy', label: 'エネルギー', unit: 'kcal' },
  { key: 'protein', label: 'たんぱく質', unit: 'g' },
  { key: 'fat', label: '脂質', unit: 'g' },
  { key: 'carbs', label: '炭水化物', unit: 'g' },
];

function DashboardPage() {
  const data = useAsync(fetchAllAISelections, []);
  return (
    <AppShell current="dashboard">
      <h1 className="mb-1 flex items-center gap-2 text-xl font-semibold tracking-tight">
        <LayoutDashboard className="size-5 text-fg-muted" aria-hidden="true" />
        ダッシュボード
      </h1>
      <p className="mb-4 text-sm text-fg-muted">AI が推奨したセットの傾向を、期間ごとに集計します。</p>
      {data.state.status === 'loading' && <Loading>AI 推奨を読み込んでいます</Loading>}
      {data.state.status === 'error' && <ErrorMessage onRetry={data.reload}>{data.state.error.message}</ErrorMessage>}
      {data.state.status === 'success' && <Dashboard days={data.state.data} />}
    </AppShell>
  );
}

function Segmented<T extends string>({ items, value, onChange, label }: { items: { id: T; label: string }[]; value: T; onChange: (id: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-border bg-surface-muted p-0.5">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={item.id === value}
          onClick={() => onChange(item.id)}
          className={`min-h-10 rounded-md px-3 text-sm transition-colors ${item.id === value ? 'bg-surface font-medium text-fg shadow-sm' : 'text-fg-muted hover:text-fg'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function StatTile({ label, value, unit, note }: { label: string; value: string; unit?: string; note?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-3">
      <p className="text-xs text-fg-muted">{label}</p>
      <p className="mt-0.5 text-2xl font-semibold tracking-tight">
        {value}
        {unit && <span className="ml-0.5 text-sm font-normal text-fg-muted">{unit}</span>}
      </p>
      {note && <p className="text-xs text-fg-muted">{note}</p>}
    </div>
  );
}

function Dashboard({ days: allDays }: { days: DaySelection[] }) {
  const [period, setPeriod] = useState<Period>('4w');
  const [distribution, setDistribution] = useState<Distribution>('score');
  const [today] = useState(() => todayInTokyo());

  const days = useMemo(() => filterByPeriod(allDays, period, today), [allDays, period, today]);
  const view = useMemo(() => {
    const values = menuValues(days);
    return {
      summary: summarize(days),
      trend: dailyMeanScores(days),
      pfc: pfcRatio(days),
      top: topMenus(days),
      values,
      stats: STAT_ROWS.map((row) => ({ ...row, stats: describe(values[row.key]) })),
    };
  }, [days]);

  const dist = DISTRIBUTIONS.find((d) => d.id === distribution)!;
  const bins = histogram(view.values[distribution], dist.size);
  const range = days.length > 0 ? `${formatDateLabel(days[0].date)} 〜 ${formatDateLabel(days[days.length - 1].date)}` : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Segmented items={PERIODS} value={period} onChange={setPeriod} label="集計する期間" />
        {range && <p className="text-xs text-fg-muted">{range}（作成済みの今後の推奨を含む）</p>}
      </div>

      {days.length === 0 ? (
        <EmptyState icon={Inbox} title="この期間の AI 推奨はありません" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile label="集計した日数" value={`${view.summary.dayCount}`} unit="日" note={`推奨したメニュー ${view.summary.menuCount} 品`} />
            <StatTile label="平均スコア" value={view.summary.meanScore.toFixed(1)} unit="%" note="メニュー1品あたり" />
            <StatTile label="平均エネルギー" value={`${Math.round(view.summary.meanSetEnergy)}`} unit="kcal" note="1セットあたり" />
            <StatTile label="平均たんぱく質" value={view.summary.meanSetProtein.toFixed(1)} unit="g" note="1セットあたり" />
          </div>

          <ChartCard
            title="日ごとの平均スコア"
            caption="その日のセットに入ったメニューのスコアの平均"
            table={{ head: ['日付', 'スコア（%）'], rows: view.trend.map((d) => [formatDateLabel(d.date), d.score.toFixed(1)]) }}
          >
            <ScoreTrendChart data={view.trend} />
          </ChartCard>

          {view.pfc && (
            <ChartCard
              title="PFC 比"
              caption="推奨したメニューのたんぱく質・脂質・炭水化物を、カロリーに換算した割合"
              table={{
                head: ['項目', '割合（%）'],
                rows: [
                  ['たんぱく質', view.pfc.protein.toFixed(1)],
                  ['脂質', view.pfc.fat.toFixed(1)],
                  ['炭水化物', view.pfc.carbs.toFixed(1)],
                ],
              }}
            >
              <PfcBar ratio={view.pfc} />
            </ChartCard>
          )}

          <ChartCard
            title="よく推奨されるメニュー"
            caption={`推奨された回数の多い ${view.top.length} 品`}
            table={{ head: ['メニュー', '回数'], rows: view.top.map((m) => [m.name, m.count]) }}
          >
            <TopMenusBars items={view.top} />
          </ChartCard>

          <ChartCard
            title={`${dist.label}の分布`}
            caption={`推奨したメニュー1品ごとの${dist.label}（${dist.size}${dist.unit} ごと）`}
            action={<Segmented items={DISTRIBUTIONS} value={distribution} onChange={setDistribution} label="分布の項目" />}
            table={{ head: [`${dist.label}（${dist.unit}）`, '品数'], rows: bins.map((b) => [`${b.from}〜${b.to}`, b.count]) }}
          >
            <HistogramChart bins={bins} unit={dist.unit} label={(b) => `${b.from}〜${b.to}`} />
          </ChartCard>

          <section className="rounded-xl border border-border bg-surface p-4">
            <h2 className="mb-2 text-sm font-semibold">メニュー1品ごとの統計</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm tabular-nums">
                <thead className="text-xs text-fg-muted">
                  <tr>
                    <th scope="col" className="py-1.5 text-left font-medium">項目</th>
                    {['最小', '平均', '最大', '標準偏差'].map((h) => (
                      <th key={h} scope="col" className="py-1.5 text-right font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.stats.map((row) => (
                    <tr key={row.key} className="border-t border-border">
                      <th scope="row" className="py-2 text-left font-normal">
                        {row.label}
                        <span className="ml-1 text-xs text-fg-muted">{row.unit}</span>
                      </th>
                      {row.stats
                        ? [row.stats.min, row.stats.mean, row.stats.max, row.stats.std].map((v, i) => (
                            <td key={i} className="py-2 text-right">
                              {roundTenth(v)}
                            </td>
                          ))
                        : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

renderPage(<DashboardPage />);
