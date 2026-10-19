/**
 * ダッシュボードの集計（AI 推奨セットの傾向）
 *
 * 入力は ai_selections の各日のセット（selected_menus）。メニュー単位の集計（スコア、栄養値の分布、
 * よく推奨されるメニュー）と、セット単位の集計（1日あたりの合計）を分けて扱う。
 */

import { addDays, type ISODate } from './date.ts';
import type { AISelection } from './mappers.ts';

export type Period = '4w' | '3m' | 'all';

export const PERIODS: { id: Period; label: string; days: number | null }[] = [
  { id: '4w', label: '4週間', days: 28 },
  { id: '3m', label: '3か月', days: 91 },
  { id: 'all', label: '全期間', days: null },
];

export type DaySelection = Pick<AISelection, 'date' | 'menus'>;

/** 期間で絞る。今日から数えて過去 N 日（今日を含む）と、それより先に作られている推奨 */
export function filterByPeriod(days: readonly DaySelection[], period: Period, today: ISODate): DaySelection[] {
  const length = PERIODS.find((p) => p.id === period)?.days ?? null;
  const from = length === null ? null : addDays(today, -(length - 1));
  return days.filter((day) => day.menus.length > 0 && (from === null || day.date >= from)).sort((a, b) => a.date.localeCompare(b.date));
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

const mean = (values: readonly number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0);

export interface Stats {
  min: number;
  mean: number;
  max: number;
  /** 標準偏差（母集団） */
  std: number;
}

export function describe(values: readonly number[]): Stats | null {
  if (values.length === 0) return null;
  const m = mean(values);
  return {
    min: Math.min(...values),
    mean: m,
    max: Math.max(...values),
    std: Math.sqrt(mean(values.map((v) => (v - m) ** 2))),
  };
}

export interface Summary {
  dayCount: number;
  menuCount: number;
  /** メニューのスコアの平均（%） */
  meanScore: number;
  /** 1日（1セット）あたりの合計の平均 */
  meanSetEnergy: number;
  meanSetProtein: number;
}

export function summarize(days: readonly DaySelection[]): Summary {
  const menus = days.flatMap((d) => d.menus);
  const setTotal = (key: string) => mean(days.map((d) => d.menus.reduce((sum, m) => sum + num(m.nutrition[key]), 0)));
  return {
    dayCount: days.length,
    menuCount: menus.length,
    meanScore: mean(menus.map((m) => num(m.score) * 100)),
    meanSetEnergy: setTotal('エネルギー'),
    meanSetProtein: setTotal('たんぱく質'),
  };
}

/** 日ごとの平均スコア（%） */
export function dailyMeanScores(days: readonly DaySelection[]): { date: ISODate; score: number }[] {
  return days.map((d) => ({ date: d.date, score: mean(d.menus.map((m) => num(m.score) * 100)) }));
}

/**
 * PFC 比（カロリーで見た割合、%）。たんぱく質・炭水化物は 4kcal/g、脂質は 9kcal/g で換算し、
 * 3つの合計を 100% とする（旧ダッシュボードはエネルギーの値で割っていたので、合計が 100% にならなかった）
 */
export function pfcRatio(days: readonly DaySelection[]): { protein: number; fat: number; carbs: number } | null {
  const menus = days.flatMap((d) => d.menus);
  const protein = menus.reduce((s, m) => s + num(m.nutrition['たんぱく質']) * 4, 0);
  const fat = menus.reduce((s, m) => s + num(m.nutrition['脂質']) * 9, 0);
  const carbs = menus.reduce((s, m) => s + num(m.nutrition['炭水化物']) * 4, 0);
  const total = protein + fat + carbs;
  if (total <= 0) return null;
  return { protein: (protein / total) * 100, fat: (fat / total) * 100, carbs: (carbs / total) * 100 };
}

/** 推奨された回数の多いメニュー（同じ回数なら名前順） */
export function topMenus(days: readonly DaySelection[], limit = 10): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const menu of days.flatMap((d) => d.menus)) counts.set(menu.name, (counts.get(menu.name) ?? 0) + 1);
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'ja'))
    .slice(0, limit);
}

export interface Bin {
  from: number;
  to: number;
  count: number;
}

/** 幅 size の階級で数える（0 から最大値を含む階級まで。空の階級も 0 件として残す） */
export function histogram(values: readonly number[], size: number): Bin[] {
  if (values.length === 0) return [];
  const last = Math.floor(Math.max(...values) / size);
  const bins: Bin[] = Array.from({ length: last + 1 }, (_, i) => ({ from: i * size, to: (i + 1) * size, count: 0 }));
  for (const value of values) bins[Math.max(0, Math.floor(value / size))].count++;
  return bins;
}

/** メニュー単位の値（分布と統計表に使う） */
export function menuValues(days: readonly DaySelection[]) {
  const menus = days.flatMap((d) => d.menus);
  return {
    score: menus.map((m) => num(m.score) * 100),
    energy: menus.map((m) => num(m.nutrition['エネルギー'])),
    protein: menus.map((m) => num(m.nutrition['たんぱく質'])),
    fat: menus.map((m) => num(m.nutrition['脂質'])),
    carbs: menus.map((m) => num(m.nutrition['炭水化物'])),
  };
}
