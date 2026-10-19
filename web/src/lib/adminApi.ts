/**
 * 食事記録（meal_history）の読み書き。RLS で管理者（app_metadata.role = 'admin'）だけに許可している。
 */

import type { ISODate } from './date.ts';
import type { MealRecordRow } from './mealRecord.ts';
import { supabase } from './supabase.ts';

export interface RecentRecord {
  date: ISODate;
  selected_menus: { name: string }[];
}

export async function fetchMealRecord(date: ISODate): Promise<{ selected_menus: unknown } | null> {
  const { data, error } = await supabase.from('meal_history').select('selected_menus').eq('date', date).maybeSingle();
  if (error) throw new Error(`記録を読み込めませんでした: ${error.message}`);
  return data;
}

export async function saveMealRecord(row: MealRecordRow) {
  const { error } = await supabase.from('meal_history').upsert(row, { onConflict: 'date' });
  if (error) throw new Error(`保存できませんでした: ${error.message}`);
}

export async function fetchRecentRecords(limit = 5): Promise<RecentRecord[]> {
  const { data, error } = await supabase
    .from('meal_history')
    .select('date, selected_menus')
    .order('date', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`最近の記録を読み込めませんでした: ${error.message}`);
  return data ?? [];
}
