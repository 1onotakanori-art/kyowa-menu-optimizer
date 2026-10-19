/**
 * Supabase の行を画面で使う形に直す（通信しないので単体テストできる）
 */

import type { ISODate } from './date.ts';
import type { Menu, NutritionValue } from './nutrition.ts';

export interface AIMenu {
  name: string;
  /** 全メニューの中での順位（セット内の並び順に使う。画面にはセット内の順番を出す） */
  rank: number;
  /** 0〜1 */
  score: number;
  /** staple / main / side / soup / dessert など */
  role: string | null;
  /** 主食 / 主菜 / 副菜 / 汁物 / デザート など */
  roleLabel: string;
  reasons: string[];
  nutrition: Record<string, NutritionValue>;
}

export interface AISelection {
  date: ISODate;
  generatedAt: string | null;
  /** Claude が付けた「ひとこと解説」 */
  setComment: string | null;
  /** セットを選んだ理由（モデルが作る説明文） */
  setReason: string | null;
  menus: AIMenu[];
}

export interface MenuRow {
  menu_name: string;
  nutrition: Record<string, NutritionValue> | null;
}

export interface AISelectionRow {
  date: string;
  generated_at?: string | null;
  set_comment?: string | null;
  model_info?: { set_reason?: unknown } | null;
  selected_menus?: unknown;
}

export function mapMenuRows(rows: readonly MenuRow[]): Menu[] {
  return rows.map((row) => ({ name: row.menu_name, nutrition: row.nutrition ?? {} }));
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function mapAISelectionRow(row: AISelectionRow): AISelection {
  const menus = Array.isArray(row.selected_menus) ? row.selected_menus : [];
  return {
    date: row.date,
    generatedAt: row.generated_at ?? null,
    setComment: asString(row.set_comment),
    setReason: asString(row.model_info?.set_reason),
    menus: menus
      .filter((m): m is Record<string, unknown> => typeof m === 'object' && m !== null && typeof m.name === 'string')
      .map((m, index) => ({
        name: m.name as string,
        rank: typeof m.rank === 'number' ? m.rank : index + 1,
        score: typeof m.score === 'number' ? m.score : 0,
        role: asString(m.role),
        roleLabel: asString(m.roleLabel) ?? '',
        reasons: Array.isArray(m.reasons) ? m.reasons.filter((r): r is string => typeof r === 'string') : [],
        nutrition: (m.nutrition as Record<string, NutritionValue> | undefined) ?? {},
      }))
      .sort((a, b) => a.rank - b.rank),
  };
}
