/**
 * ダッシュボードのグラフ。色は global.css の --chart-*（dataviz の検証済みパレット）を使う。
 * 線は 2px、棒は 24px 以下で先端だけ角丸、グリッドは細い実線、文字は文字用の色（系列の色は使わない）。
 */

import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateLabel, type ISODate } from '../../lib/date.ts';
import type { Bin } from '../../lib/dashboard.ts';
import { ChartTooltip } from './ChartCard.tsx';

const AXIS_TICK = { fill: 'var(--fg-muted)', fontSize: 11 };
const shortDate = (date: string) => {
  const [, m, d] = date.split('-').map(Number);
  return `${m}/${d}`;
};

/** 日ごとの平均スコアの推移（1系列なので凡例なし。タイトルが系列を示す） */
export function ScoreTrendChart({ data }: { data: { date: ISODate; score: number }[] }) {
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="date" tickFormatter={shortDate} tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} minTickGap={28} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => `${v}%`} allowDecimals={false} />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            content={({ active, payload }) => {
              const point = active && payload?.[0]?.payload;
              return point ? <ChartTooltip label={formatDateLabel(point.date)} value={point.score.toFixed(1)} unit="%" /> : null;
            }}
          />
          <Line
            type="linear"
            dataKey="score"
            stroke="var(--chart-1)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={false}
            activeDot={{ r: 5, fill: 'var(--chart-1)', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** 分布（階級ごとの件数）。値は ツールチップと「表で見る」で読める */
export function HistogramChart({ bins, unit, label }: { bins: Bin[]; unit: string; label: (bin: Bin) => string }) {
  const data = bins.map((bin) => ({ ...bin, name: label(bin) }));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -20 }} barCategoryGap={2}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="from" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: 'var(--border-strong)' }} minTickGap={8} />
          <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} allowDecimals={false} width={44} />
          <Tooltip
            cursor={{ fill: 'var(--surface-muted)' }}
            content={({ active, payload }) => {
              const bin = active && payload?.[0]?.payload;
              return bin ? <ChartTooltip label={`${bin.name}${unit}`} value={`${bin.count}`} unit="品" /> : null;
            }}
          />
          <Bar dataKey="count" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

const PFC_PARTS = [
  { key: 'protein', label: 'たんぱく質', color: 'var(--chart-1)' },
  { key: 'fat', label: '脂質', color: 'var(--chart-2)' },
  { key: 'carbs', label: '炭水化物', color: 'var(--chart-3)' },
] as const;

/** PFC 比（100% の積み上げ横棒）。区切りは 2px の隙間、割合は棒の下に直接書く */
export function PfcBar({ ratio }: { ratio: { protein: number; fat: number; carbs: number } }) {
  return (
    <div>
      <div className="flex h-6 gap-0.5" role="img" aria-label={PFC_PARTS.map((p) => `${p.label} ${ratio[p.key].toFixed(0)}%`).join('、')}>
        {PFC_PARTS.map((part) => (
          <div
            key={part.key}
            className="h-full first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${ratio[part.key]}%`, backgroundColor: part.color }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {PFC_PARTS.map((part) => (
          <li key={part.key} className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm" style={{ backgroundColor: part.color }} aria-hidden="true" />
            <span className="text-fg-muted">{part.label}</span>
            <span className="font-semibold tabular-nums">{ratio[part.key].toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** よく推奨されるメニュー（横棒。名前が長いので名前を棒の上に置き、回数は棒の先に書く） */
export function TopMenusBars({ items }: { items: { name: string; count: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ol className="space-y-2.5">
      {items.map((item) => (
        <li key={item.name}>
          <p className="mb-1 text-sm leading-snug">{item.name}</p>
          <div className="flex items-center gap-2">
            <div className="h-2.5 rounded-r-[4px]" style={{ width: `${(item.count / max) * 85}%`, backgroundColor: 'var(--chart-1)' }} aria-hidden="true" />
            <span className="text-xs font-semibold tabular-nums">{item.count}回</span>
          </div>
        </li>
      ))}
    </ol>
  );
}
