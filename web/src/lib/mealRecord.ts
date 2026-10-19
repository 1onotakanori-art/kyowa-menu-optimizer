/**
 * 食事記録（meal_history）の行の組み立てと読み戻し。ML の学習データになるので、形は今の管理画面と同じにする。
 */

import { weekdayOf, type ISODate } from './date.ts';
import { TARGET_FIELDS, sumNutrition, type Menu, type NutritionValue } from './nutrition.ts';

const WEEKDAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const DEFAULT_RATING = 3;
export const RATINGS = [1, 2, 3, 4, 5] as const;

/** 食べたメニューと評価（メニュー名 → 1〜5） */
export type Selection = ReadonlyMap<string, number>;

export interface MealRecordRow {
  date: ISODate;
  day_of_week: string;
  user_name: string;
  timestamp: string;
  settings: { targets: Record<string, never>; preferences: Record<string, never> };
  selected_menus: { name: string; nutrition: Record<string, NutritionValue>; rating: number }[];
  totals: Record<string, number>;
  achievement: Record<string, never>;
}

/** 保存する行。メニューはその日の並び順、合計は E/P/F/C/V の5項目 */
export function buildMealRecord(date: ISODate, menus: readonly Menu[], selection: Selection, now: Date = new Date()): MealRecordRow {
  const eaten = menus.filter((menu) => selection.has(menu.name));
  const sums = sumNutrition(eaten);
  return {
    date,
    day_of_week: WEEKDAY_LABELS[weekdayOf(date)],
    user_name: 'ONO',
    timestamp: now.toISOString(),
    settings: { targets: {}, preferences: {} },
    selected_menus: eaten.map((menu) => ({ name: menu.name, nutrition: menu.nutrition, rating: selection.get(menu.name) ?? DEFAULT_RATING })),
    totals: Object.fromEntries(TARGET_FIELDS.map((field) => [field.key, sums[field.key] ?? 0])),
    achievement: {},
  };
}

/** 保存済みの記録から、選択と評価を戻す（評価がなければ初期値） */
export function selectionFromRecord(record: { selected_menus?: unknown } | null): Map<string, number> {
  const selection = new Map<string, number>();
  if (!record || !Array.isArray(record.selected_menus)) return selection;
  for (const item of record.selected_menus) {
    if (typeof item?.name !== 'string') continue;
    const rating = RATINGS.includes(item.rating) ? item.rating : DEFAULT_RATING;
    selection.set(item.name, rating);
  }
  return selection;
}
