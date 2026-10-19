/**
 * Supabase からの読み込み（メイン画面用）。行の変換は mappers.ts
 */

import { addDays, todayInTokyo, type ISODate } from './date.ts';
import type { Menu } from './nutrition.ts';
import { mapAISelectionRow, mapMenuRows, type AISelection } from './mappers.ts';
import { supabase } from './supabase.ts';

/** 日付の一覧を何日先まで読むか */
const DATE_RANGE_DAYS = 90;

/** 今日（日本時間）から 90 日先までの、メニューがある日付 */
export async function fetchAvailableDates(now: Date = new Date()): Promise<ISODate[]> {
  const today = todayInTokyo(now);
  const { data, error } = await supabase
    .from('menus')
    .select('date')
    .gte('date', today)
    .lte('date', addDays(today, DATE_RANGE_DAYS))
    .order('date', { ascending: true });
  if (error) throw new Error(`日付を読み込めませんでした: ${error.message}`);
  return [...new Set((data ?? []).map((row: { date: string }) => row.date))];
}

export async function fetchMenus(date: ISODate): Promise<Menu[]> {
  const { data, error } = await supabase.from('menus').select('menu_name, nutrition').eq('date', date);
  if (error) throw new Error(`メニューを読み込めませんでした: ${error.message}`);
  return mapMenuRows(data ?? []);
}

/** その日の AI 推奨。まだ作られていなければ null */
export async function fetchAISelection(date: ISODate): Promise<AISelection | null> {
  const { data, error } = await supabase
    .from('ai_selections')
    .select('date, generated_at, set_comment, model_info, selected_menus')
    .eq('date', date)
    .maybeSingle();
  if (error) throw new Error(`AI 推奨を読み込めませんでした: ${error.message}`);
  return data ? mapAISelectionRow(data) : null;
}
