/**
 * メニューの組み合わせの最適化
 *
 * 目標（E/P/F/C/V）に最も近づく追加メニューを選ぶ。固定メニューは必ず含め、除外メニューは使わない。
 * 1. 貪欲法: 距離が最も小さくなる1品を、改善しなくなるか上限に達するまで足していく
 * 2. ローカルサーチ: 「1品減らす」「1品入れ替える」「1品足す」で距離が小さくなる限り改善する
 * ローカルサーチは距離が小さくなる変更しか採用しないので、結果が貪欲法より悪くなることはない。
 *
 * 旧実装は2つあった（app.js は貪欲法のみ、src/optimizer/optimizeMenus.js は貪欲法 + ローカルサーチ）。
 * 距離の計算は同じなので、より目標に近い後者の手順にまとめた。
 */

import {
  addNutrition,
  differenceFromTargets,
  sumNutrition,
  type Menu,
  type NutritionTotals,
  type TargetKey,
  type Targets,
} from './nutrition.ts';

interface DistanceRule {
  /** 超過の許容幅（目標に対する割合） */
  overTol: number;
  /** 不足の許容幅（目標に対する割合） */
  underTol: number;
  /** 超過してもよい項目（超過は距離に数えない） */
  ignoreOver: boolean;
  /** 不足してもよい項目（不足は距離に数えない） */
  ignoreUnder: boolean;
}

/**
 * 項目ごとの距離のルール
 * - エネルギー: 超過は 10%、不足は 20% の幅で評価
 * - たんぱく質・野菜: 多いぶんには構わない（不足だけ 10% の幅で評価）
 * - 脂質・炭水化物: 少ないぶんには構わない（超過だけ 10% の幅で評価）
 */
export const DISTANCE_RULES: Record<TargetKey, DistanceRule> = {
  エネルギー: { overTol: 0.1, underTol: 0.2, ignoreOver: false, ignoreUnder: false },
  たんぱく質: { overTol: 0.2, underTol: 0.1, ignoreOver: true, ignoreUnder: false },
  脂質: { overTol: 0.1, underTol: 0.2, ignoreOver: false, ignoreUnder: true },
  炭水化物: { overTol: 0.1, underTol: 0.2, ignoreOver: false, ignoreUnder: true },
  野菜重量: { overTol: 0.2, underTol: 0.1, ignoreOver: true, ignoreUnder: false },
};

const EPSILON = 1e-6;

/**
 * 目標からの距離（0 が最良）。
 * 各項目のずれを許容幅で割って2乗し、目標を設定した項目数で平均する。
 */
export function calculateDistance(targets: Targets, actual: NutritionTotals): number {
  const entries = Object.entries(targets) as [TargetKey, number][];
  if (entries.length === 0) return 0;

  let total = 0;
  for (const [key, target] of entries) {
    const diff = (actual[key] ?? 0) - target;
    const rule = DISTANCE_RULES[key];
    if (diff >= 0 && rule.ignoreOver) continue;
    if (diff < 0 && rule.ignoreUnder) continue;

    if (target <= 0) {
      total += Math.abs(diff);
      continue;
    }
    const scale = Math.max(target * (diff >= 0 ? rule.overTol : rule.underTol), EPSILON);
    total += (diff / scale) ** 2;
  }
  return total / entries.length;
}

export interface OptimizeInput {
  menus: readonly Menu[];
  targets: Targets;
  fixedNames?: Iterable<string>;
  excludedNames?: Iterable<string>;
  /** 追加で選ぶメニューの上限（固定メニューは数えない） */
  maxAdditional: number;
}

export interface OptimizeResult {
  fixedMenus: Menu[];
  additionalMenus: Menu[];
  /** 固定 + 追加 */
  selectedMenus: Menu[];
  fixedNutrition: NutritionTotals;
  additionalNutrition: NutritionTotals;
  totalNutrition: NutritionTotals;
  targets: Targets;
  difference: Partial<Record<TargetKey, number>>;
  distance: number;
}

function buildResult(fixedMenus: Menu[], additionalMenus: Menu[], targets: Targets): OptimizeResult {
  const fixedNutrition = sumNutrition(fixedMenus);
  const additionalNutrition = sumNutrition(additionalMenus);
  const totalNutrition = sumNutrition([...fixedMenus, ...additionalMenus]);
  return {
    fixedMenus,
    additionalMenus,
    selectedMenus: [...fixedMenus, ...additionalMenus],
    fixedNutrition,
    additionalNutrition,
    totalNutrition,
    targets,
    difference: differenceFromTargets(totalNutrition, targets),
    distance: calculateDistance(targets, totalNutrition),
  };
}

function greedy(candidates: readonly Menu[], targets: Targets, base: NutritionTotals, max: number): Menu[] {
  const selected: Menu[] = [];
  const remaining = [...candidates];
  let current = base;
  let currentDistance = calculateDistance(targets, current);

  while (selected.length < max && remaining.length > 0) {
    let bestIndex = -1;
    let bestDistance = currentDistance;
    remaining.forEach((menu, index) => {
      const distance = calculateDistance(targets, addNutrition(current, menu.nutrition));
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    if (bestIndex === -1) break;

    const [picked] = remaining.splice(bestIndex, 1);
    selected.push(picked);
    current = addNutrition(current, picked.nutrition);
    currentDistance = bestDistance;
  }
  return selected;
}

/** 改善の繰り返しの上限（念のための無限ループ防止） */
const MAX_LOCAL_SEARCH_ROUNDS = 50;

function localSearch(initial: Menu[], candidates: readonly Menu[], targets: Targets, base: NutritionTotals, max: number) {
  let selected = initial;
  const distanceOf = (menus: Menu[]) => calculateDistance(targets, addNutrition(base, sumNutrition(menus)));
  let currentDistance = distanceOf(selected);

  for (let round = 0; round < MAX_LOCAL_SEARCH_ROUNDS; round++) {
    const unused = candidates.filter((menu) => !selected.includes(menu));
    const moves: Menu[][] = [
      // 1品減らす
      ...selected.map((_, i) => selected.filter((__, j) => j !== i)),
      // 1品入れ替える
      ...selected.flatMap((_, i) => unused.map((menu) => selected.map((m, j) => (j === i ? menu : m)))),
      // 1品足す
      ...(selected.length < max ? unused.map((menu) => [...selected, menu]) : []),
    ];

    const better = moves.find((move) => distanceOf(move) < currentDistance);
    if (!better) break;
    selected = better;
    currentDistance = distanceOf(better);
  }
  return selected;
}

/** 固定メニューに、目標に近づく追加メニューを組み合わせる */
export function optimizeMenus({ menus, targets, fixedNames = [], excludedNames = [], maxAdditional }: OptimizeInput): OptimizeResult {
  const fixed = new Set(fixedNames);
  const excluded = new Set(excludedNames);
  const fixedMenus = menus.filter((menu) => fixed.has(menu.name));
  const candidates = menus.filter((menu) => !fixed.has(menu.name) && !excluded.has(menu.name));
  const base = sumNutrition(fixedMenus);
  const max = Math.max(0, Math.floor(maxAdditional));

  const initial = greedy(candidates, targets, base, max);
  const additionalMenus = localSearch(initial, candidates, targets, base, max);
  return buildResult(fixedMenus, additionalMenus, targets);
}

/** 固定メニューだけの結果（「結果表示」ボタン用） */
export function fixedOnlyResult(menus: readonly Menu[], targets: Targets, fixedNames: Iterable<string>): OptimizeResult {
  const fixed = new Set(fixedNames);
  return buildResult(
    menus.filter((menu) => fixed.has(menu.name)),
    [],
    targets,
  );
}
