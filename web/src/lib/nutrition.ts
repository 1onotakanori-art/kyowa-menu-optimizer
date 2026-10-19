/**
 * メニューと栄養値
 *
 * メニューの栄養値は Supabase の menus.nutrition（JSONB）そのまま。
 * 数値の項目（エネルギーなど）は number、アレルゲンは '◯'（含む）/ '－'（含まない）の文字列。
 */

export type NutritionValue = number | string;

export interface Menu {
  name: string;
  nutrition: Record<string, NutritionValue>;
}

/** 栄養値の合計や目標。数値の項目だけを持つ */
export type NutritionTotals = Record<string, number>;

/** 最適化の目標にできる5項目 */
export type TargetKey = 'エネルギー' | 'たんぱく質' | '脂質' | '炭水化物' | '野菜重量';

export interface TargetField {
  key: TargetKey;
  /** 画面に出す1文字の略称（E / P / F / C / V） */
  short: string;
  label: string;
  unit: string;
  /** 目標を有効にしたときに最初に入れる値 */
  defaultValue: number;
}

export const TARGET_FIELDS: readonly TargetField[] = [
  { key: 'エネルギー', short: 'E', label: 'エネルギー', unit: 'kcal', defaultValue: 650 },
  { key: 'たんぱく質', short: 'P', label: 'たんぱく質', unit: 'g', defaultValue: 30 },
  { key: '脂質', short: 'F', label: '脂質', unit: 'g', defaultValue: 25 },
  { key: '炭水化物', short: 'C', label: '炭水化物', unit: 'g', defaultValue: 95 },
  { key: '野菜重量', short: 'V', label: '野菜重量', unit: 'g', defaultValue: 120 },
];

export type Targets = Partial<Record<TargetKey, number>>;

/** 数値の項目だけを足し合わせる（アレルゲンなどの文字列は無視する） */
export function addNutrition(base: NutritionTotals, extra: Record<string, NutritionValue>): NutritionTotals {
  const result = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      result[key] = (result[key] ?? 0) + value;
    }
  }
  return result;
}

/** メニューの栄養値の合計 */
export function sumNutrition(menus: readonly Menu[]): NutritionTotals {
  return menus.reduce<NutritionTotals>((total, menu) => addNutrition(total, menu.nutrition ?? {}), {});
}

/** 目標との差（+ は超過、- は不足）。目標がある項目だけ */
export function differenceFromTargets(total: NutritionTotals, targets: Targets): Partial<Record<TargetKey, number>> {
  const diff: Partial<Record<TargetKey, number>> = {};
  for (const [key, target] of Object.entries(targets) as [TargetKey, number][]) {
    diff[key] = (total[key] ?? 0) - target;
  }
  return diff;
}

/** 表示用に小数第1位で丸める */
export function roundTenth(value: number): number {
  return Math.round(value * 10) / 10;
}
