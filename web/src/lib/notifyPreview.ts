/**
 * 通知ルールのプレビュー（直近のメニューで、ルールに合う日がどれだけあるか）
 * 判定は通知メールと同じ supabase/functions/_shared/matchRules.js を使う。
 */

import { evaluateRules } from '../../../supabase/functions/_shared/matchRules.js';
import type { ISODate } from './date.ts';
import type { Menu, NutritionValue } from './nutrition.ts';

export type MenusByDate = Map<ISODate, Menu[]>;

export interface Conditions {
  all: object[];
}

export interface Rule {
  id: number;
  name: string;
  enabled: boolean;
  conditions: Conditions;
}

/** Supabase の行（date, menu_name, nutrition）を日付ごとにまとめる */
export function groupMenusByDate(
  rows: readonly { date: ISODate; menu_name: string; nutrition: Record<string, NutritionValue> | null }[],
): MenusByDate {
  const byDate: MenusByDate = new Map();
  for (const row of rows) {
    const menus = byDate.get(row.date) ?? [];
    menus.push({ name: row.menu_name, nutrition: row.nutrition ?? {} });
    byDate.set(row.date, menus);
  }
  return byDate;
}

function hitMenus(menus: Menu[], conditions: Conditions): Menu[] | null {
  const [result] = evaluateRules(menus, [{ name: '', enabled: true, conditions }]);
  return result ? (result.menus as Menu[]) : null;
}

/** 今日以降で、ルールに合うメニューがある日の数（ルールの有効・無効は問わない） */
export function countUpcomingHitDays(menusByDate: MenusByDate, conditions: Conditions, today: ISODate): number {
  let days = 0;
  for (const [date, menus] of menusByDate) {
    if (date >= today && hitMenus(menus, conditions)) days++;
  }
  return days;
}

export interface Preview {
  /** 今日以降で該当する日と、該当したメニュー名 */
  upcoming: { date: ISODate; names: string[] }[];
  pastDays: number;
  pastHitDays: number;
}

export function buildPreview(menusByDate: MenusByDate, conditions: Conditions, today: ISODate): Preview {
  const preview: Preview = { upcoming: [], pastDays: 0, pastHitDays: 0 };
  for (const [date, menus] of [...menusByDate].sort(([a], [b]) => a.localeCompare(b))) {
    const hits = hitMenus(menus, conditions);
    if (date < today) {
      preview.pastDays++;
      if (hits) preview.pastHitDays++;
    } else if (hits) {
      preview.upcoming.push({ date, names: hits.map((m) => m.name) });
    }
  }
  return preview;
}

/** 名前の候補（「メニュー名が一致」の入力補助） */
export function menuNameOptions(menusByDate: MenusByDate): string[] {
  const names = new Set<string>();
  for (const menus of menusByDate.values()) for (const menu of menus) names.add(menu.name);
  return [...names].sort((a, b) => a.localeCompare(b, 'ja'));
}
