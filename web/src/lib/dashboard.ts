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
 * PFC 比（重さで見た割合、%）。推奨したメニューのたんぱく質・脂質・炭水化物のグラム数を合計し、3つの合計を 100% とする
 */
export function pfcRatio(days: readonly DaySelection[]): { protein: number; fat: number; carbs: number } | null {
  const menus = days.flatMap((d) => d.menus);
  const grams = (key: string) => menus.reduce((s, m) => s + num(m.nutrition[key]), 0);
  const protein = grams('たんぱく質');
  const fat = grams('脂質');
  const carbs = grams('炭水化物');
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

const NUTRIENT_KEYS = {
  energy: 'エネルギー',
  protein: 'たんぱく質',
  fat: '脂質',
  carbs: '炭水化物',
  vegetable: '野菜重量',
} as const;

export type ValueKey = 'count' | 'score' | keyof typeof NUTRIENT_KEYS;

/** メニュー1品ごとの値（分布と統計表に使う） */
export function menuValues(days: readonly DaySelection[]): Record<Exclude<ValueKey, 'count'>, number[]> {
  const menus = days.flatMap((d) => d.menus);
  const values = Object.fromEntries(
    Object.entries(NUTRIENT_KEYS).map(([id, key]) => [id, menus.map((m) => num(m.nutrition[key]))]),
  ) as Record<keyof typeof NUTRIENT_KEYS, number[]>;
  return { score: menus.map((m) => num(m.score) * 100), ...values };
}

/** 1セット（1日）ごとの値。品数、スコアはセット内の平均、栄養値はセットの合計 */
export function setValues(days: readonly DaySelection[]): Record<ValueKey, number[]> {
  const values = Object.fromEntries(
    Object.entries(NUTRIENT_KEYS).map(([id, key]) => [id, days.map((d) => d.menus.reduce((sum, m) => sum + num(m.nutrition[key]), 0))]),
  ) as Record<keyof typeof NUTRIENT_KEYS, number[]>;
  return {
    count: days.map((d) => d.menus.length),
    score: days.map((d) => mean(d.menus.map((m) => num(m.score) * 100))),
    ...values,
  };
}
