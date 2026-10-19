/**
 * 通知ページの読み書き（profiles / notification_rules / notification_deliveries / menus）
 * どれもログインした本人の行だけを RLS で読み書きできる（menus は誰でも読める）。
 */

import { addDays, type ISODate } from './date.ts';
import { groupMenusByDate, type Conditions, type MenusByDate, type Rule } from './notifyPreview.ts';
import { supabase } from './supabase.ts';

/** プレビューに使うメニューの範囲（今日を基準に） */
const PREVIEW_PAST_DAYS = 14;
const PREVIEW_FUTURE_DAYS = 21;
const PAGE_SIZE = 1000;

export interface Profile {
  email_enabled: boolean;
  /** 1 = 月曜 … 7 = 日曜 */
  notify_weekdays: number[];
}

export interface Delivery {
  menu_date: ISODate;
  status: string;
  matched: { ruleName: string }[] | null;
}

function fail(action: string, error: { message: string }): never {
  throw new Error(`${action}: ${error.message}`);
}

export async function fetchProfile(userId: string): Promise<Profile> {
  const { data, error } = await supabase.from('profiles').select('email_enabled, notify_weekdays').eq('user_id', userId).maybeSingle();
  if (error) fail('通知設定を読み込めませんでした', error);
  return data ?? { email_enabled: true, notify_weekdays: [1, 2, 3, 4, 5] };
}

export async function saveProfile(userId: string, profile: Profile) {
  const { error } = await supabase.from('profiles').update(profile).eq('user_id', userId);
  if (error) fail('保存できませんでした', error);
}

export async function fetchRules(): Promise<Rule[]> {
  const { data, error } = await supabase
    .from('notification_rules')
    .select('id, name, enabled, conditions')
    .order('created_at', { ascending: true });
  if (error) fail('ルールを読み込めませんでした', error);
  return data ?? [];
}

export async function setRuleEnabled(id: number, enabled: boolean) {
  const { error } = await supabase.from('notification_rules').update({ enabled }).eq('id', id);
  if (error) fail('更新できませんでした', error);
}

export async function deleteRule(id: number) {
  const { error } = await supabase.from('notification_rules').delete().eq('id', id);
  if (error) fail('削除できませんでした', error);
}

export async function saveRule(id: number | null, name: string, conditions: Conditions) {
  const { error } = id
    ? await supabase.from('notification_rules').update({ name, conditions }).eq('id', id)
    : await supabase.from('notification_rules').insert({ name, conditions });
  if (error) fail('保存できませんでした', error);
}

export async function fetchDeliveries(): Promise<Delivery[]> {
  const { data, error } = await supabase
    .from('notification_deliveries')
    .select('menu_date, status, matched')
    .order('menu_date', { ascending: false })
    .limit(10);
  if (error) fail('通知の履歴を読み込めませんでした', error);
  return data ?? [];
}

/** プレビュー用のメニュー（1回の取得上限 1000 件を超えるので、ページを分けて読む） */
export async function fetchPreviewMenus(today: ISODate): Promise<MenusByDate> {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('menus')
      .select('date, menu_name, nutrition')
      .gte('date', addDays(today, -PREVIEW_PAST_DAYS))
      .lte('date', addDays(today, PREVIEW_FUTURE_DAYS))
      .order('date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) fail('メニューを読み込めませんでした', error);
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return groupMenusByDate(rows);
}
