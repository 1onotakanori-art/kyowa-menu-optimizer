/**
 * メニュー最適化ロジック（貪欲法 + ローカルサーチ）
 * 理由：40 個程度のメニューから最適な組み合わせを高速に見つける
 * 改良：固定メニュー、除外メニュー、下限制限に対応
 */

/**
 * 複数項目の距離を計算（非対称・正規化）
 * 目的：各項目が目標に対してどれだけズレているかを「許容誤差」で規格化し、
 *       さらに超過/不足の嫌さを非対称に反映する。
 *
 * スコアの考え方：
 *   error = actual - target
 *   scale = target * toleranceFraction (超過/不足で違う)
 *   component = |error/scale|^p
 *   score = 平均(component)
 *
 * @param {Object} nutrition - 栄養データ { キー: 値 }
 * @param {Object} targets - 目標値 { キー: 目標値 }
 * @param {Object} options - オプション
 *   - preferences: { overshootBadKeys, undershootBadKeys, tolerances, power }
 * @returns {number} 距離（小さいほど目標に近い）
 */
function calculateDistance(nutrition, targets, options = {}) {
  const keys = Object.keys(targets);
  if (keys.length === 0) return 0;

  const preferences = options.preferences || {};
  const overshootBadKeys = new Set(preferences.overshootBadKeys || ['E', 'F', 'C']);
  const undershootBadKeys = new Set(preferences.undershootBadKeys || ['P', 'V']);

  const tolerances = preferences.tolerances || {
    overshootBad: { over: 0.10, under: 0.20 },
    undershootBad: { over: 0.20, under: 0.10 },
    neutral: { over: 0.15, under: 0.15 }
  };

  const power = Number.isFinite(preferences.power) ? preferences.power : 2;
  const epsilon = 1e-6;

  let totalScore = 0;

  for (const key of keys) {
    const target = Number(targets[key]) || 0;
    const actual = Number(nutrition[key]) || 0;

    // target が 0 の場合は正規化が破綻するため、絶対誤差をそのまま使う
    if (target <= 0) {
      totalScore += Math.abs(actual - target);
      continue;
    }

    const error = actual - target; // +: 超過, -: 不足

    let group = 'neutral';
    if (overshootBadKeys.has(key)) group = 'overshootBad';
    else if (undershootBadKeys.has(key)) group = 'undershootBad';

    const tol = tolerances[group] || tolerances.neutral;
    const tolFrac = error >= 0 ? (tol.over ?? 0.15) : (tol.under ?? 0.15);

    const scale = Math.max(target * tolFrac, epsilon);
    const normalized = error / scale;
    totalScore += Math.pow(Math.abs(normalized), power);
  }

  return totalScore / keys.length;
}

function addNutrition(baseNutrition, additionalNutrition, keys) {
  const total = {};
  const keyList = keys || Array.from(new Set([
    ...Object.keys(baseNutrition || {}),
    ...Object.keys(additionalNutrition || {})
  ]));

  for (const key of keyList) {
    total[key] = (baseNutrition?.[key] || 0) + (additionalNutrition?.[key] || 0);
  }
  return total;
}

/**
 * 複数メニューの合計栄養を計算
 * @param {Array} selectedMenus - メニュー配列
 * @returns {Object} 合計栄養データ
 */
function calculateTotalNutrition(selectedMenus) {
  const total = {};
  
  for (const menu of selectedMenus) {
    for (const [key, value] of Object.entries(menu.nutrition || {})) {
      if (typeof value === 'number') {
        total[key] = (total[key] || 0) + value;
      }
    }
  }
  
  return total;
}

/**
 * 目標値との差分を計算
 * @param {Object} totalNutrition - 合計栄養
 * @param {Object} targets - 目標値
 * @returns {Object} 差分 { キー: 差 }
 */
function calculateDifference(totalNutrition, targets) {
  const diff = {};
  
  for (const key of Object.keys(targets)) {
    const target = targets[key];
    const actual = totalNutrition[key] || 0;
    diff[key] = actual - target;
  }
  
  return diff;
}

/**
 * 固定メニューを指定のメニュー配列から探す
 * @param {Array} menus - メニュー配列
 * @param {Array} fixedMenuNames - 固定メニュー名の配列
 * @returns {Object} { found: [...], notFound: [...] }
 */
function findFixedMenus(menus, fixedMenuNames) {
  const found = [];
  const notFound = [];
  
  for (const name of fixedMenuNames) {
    const menu = menus.find(m => m.name === name);
    if (menu) {
      found.push(menu);
    } else {
      notFound.push(name);
    }
  }
  
  return { found, notFound };
}

/**
 * 固定メニューの栄養値を考慮した調整目標値を計算
 * 理由：固定メニューは必ず含まれるため、「追加で必要な量」を計算する
 * 
 * @param {Object} targets - 目標値
 * @param {Object} fixedNutrition - 固定メニューの合計栄養
 * @returns {Object} 調整目標値（追加で必要な値）
 */
function calculateAdjustedTargets(targets, fixedNutrition) {
  const adjusted = {};
  
  for (const key of Object.keys(targets)) {
    const target = targets[key];
    const fixed = fixedNutrition[key] || 0;
    // 追加で必要な値 = 目標値 - 固定メニューの値
    // ただし、負数にはしない（既に超過している場合は 0）
    adjusted[key] = Math.max(0, target - fixed);
  }
  
  return adjusted;
}

/**
 * 下限値を計算（固定メニューの値が下限となる）
 * @param {Object} fixedNutrition - 固定メニューの栄養
 * @param {Object} targets - 目標値
 * @returns {Object} 下限値（各項目について、固定メニューの値が下限）
 */
function calculateMinimumLimits(fixedNutrition, targets) {
  const limits = {};
  
  for (const key of Object.keys(targets)) {
    limits[key] = fixedNutrition[key] || 0;
  }
  
  return limits;
}

/**
 * 候補メニュー（除外・固定を考慮）を準備する
 * @param {Array} menus - 全メニュー
 * @param {Array} fixedMenus - 固定メニュー
 * @param {Array} excludedMenuNames - 除外するメニュー名
 * @returns {Array} 最適化の候補メニュー
 */
function prepareCandidateMenus(menus, fixedMenus, excludedMenuNames) {
  const fixedNames = fixedMenus.map(m => m.name);
  const candidates = menus.filter(m => {
    // 固定メニューは除外（既に選んでいるから）
    if (fixedNames.includes(m.name)) return false;
    // 除外メニューは除外
    if (excludedMenuNames.includes(m.name)) return false;
    return true;
  });
  
  return candidates;
}

/**
 * 貪欲法でメニュー組み合わせを最適化
 * 理由：高速で実用的な解を得られる
 * 
 * @param {Array} menus - 全メニュー配列
 * @param {Object} targets - 目標値
 * @param {number} maxMenus - 選択メニュー数上限
 * @returns {Object} { selectedMenus, totalNutrition, distance }
 */
function greedyOptimize(menus, targets, maxMenus, options = {}) {
  const baseNutrition = options.baseNutrition || {};
  const preferences = options.preferences;

  const selected = [];
  const remaining = menus.slice(); // コピー

  // 0 個の状態から開始（固定メニューのみの状態）
  let currentAdditional = calculateTotalNutrition(selected);
  let currentTotal = addNutrition(baseNutrition, currentAdditional, Object.keys(targets));
  let currentDistance = calculateDistance(currentTotal, targets, { preferences });

  while (selected.length < maxMenus && remaining.length > 0) {
    let bestIdx = -1;
    let bestDistance = currentDistance;

    // 各候補メニューについて、追加した場合の距離を計算
    for (let i = 0; i < remaining.length; i++) {
      const testSelected = [...selected, remaining[i]];
      const testAdditional = calculateTotalNutrition(testSelected);
      const testTotal = addNutrition(baseNutrition, testAdditional, Object.keys(targets));
      const testDistance = calculateDistance(testTotal, targets, { preferences });

      if (testDistance < bestDistance) {
        bestDistance = testDistance;
        bestIdx = i;
      }
    }

    // どの追加も改善しないなら打ち切り（固定だけが最善のケース等）
    if (bestIdx === -1) break;

    // 最良のメニューを選択に追加
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);

    currentAdditional = calculateTotalNutrition(selected);
    currentTotal = addNutrition(baseNutrition, currentAdditional, Object.keys(targets));
    currentDistance = bestDistance;

    console.log(`   [貪欲法] メニュー ${selected.length}: ${selected[selected.length - 1].name}`);
  }

  const additionalNutrition = calculateTotalNutrition(selected);
  const total = addNutrition(baseNutrition, additionalNutrition, Object.keys(targets));
  return {
    selectedMenus: selected,
    totalNutrition: total,
    distance: calculateDistance(total, targets, { preferences })
  };
}

/**
 * ローカルサーチで解を改善
 * 理由：貪欲法の局所最適性を脱却し、より良い解を探す
 * 
 * @param {Array} currentSelected - 現在の選択メニュー
 * @param {Array} menus - 全メニュー
 * @param {Object} targets - 目標値
 * @returns {Object} 改善後の結果
 */
function localSearch(currentSelected, menus, targets, options = {}) {
  const baseNutrition = options.baseNutrition || {};
  const preferences = options.preferences;
  const maxMenus = Number.isFinite(options.maxMenus) ? options.maxMenus : currentSelected.length;

  let selected = currentSelected.slice();
  const initialAdditional = calculateTotalNutrition(selected);
  let currentTotal = addNutrition(baseNutrition, initialAdditional, Object.keys(targets));
  let currentDistance = calculateDistance(currentTotal, targets, { preferences });
  
  let improved = true;
  let iterations = 0;
  const maxIterations = 20; // 無限ループ防止
  
  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;

    // 0. 1 個削除（選びすぎを解消）
    if (selected.length > 0) {
      for (let i = 0; i < selected.length; i++) {
        const testSelected = [
          ...selected.slice(0, i),
          ...selected.slice(i + 1)
        ];
        const testAdditional = calculateTotalNutrition(testSelected);
        const testTotal = addNutrition(baseNutrition, testAdditional, Object.keys(targets));
        const testDistance = calculateDistance(testTotal, targets, { preferences });

        if (testDistance < currentDistance) {
          selected = testSelected;
          currentTotal = testTotal;
          currentDistance = testDistance;
          improved = true;
          console.log(`   [ローカルサーチ] 改善: 1 個削除（距離: ${testDistance.toFixed(2)}）`);
          break;
        }
      }
      if (improved) continue;
    }
    
    // 1. 1 個のメニューを入れ替える試行
    for (let i = 0; i < selected.length; i++) {
      for (const candidate of menus) {
        // すでに選択されているメニューはスキップ
        if (selected.includes(candidate)) continue;
        
        // i 番目をこのメニューに入れ替える
        const testSelected = [
          ...selected.slice(0, i),
          candidate,
          ...selected.slice(i + 1)
        ];
        const testAdditional = calculateTotalNutrition(testSelected);
        const testTotal = addNutrition(baseNutrition, testAdditional, Object.keys(targets));
        const testDistance = calculateDistance(testTotal, targets, { preferences });
        
        // 改善できたら採用
        if (testDistance < currentDistance) {
          selected = testSelected;
          currentTotal = testTotal;
          currentDistance = testDistance;
          improved = true;
          console.log(`   [ローカルサーチ] 改善: ${selected[i].name} に入れ替え（距離: ${testDistance.toFixed(2)}）`);
          break; // 内側のループを抜ける
        }
      }
      if (improved) break; // 外側のループも抜ける
    }

    if (improved) continue;

    // 2. 1 個追加（まだ余地がある場合）
    if (selected.length < maxMenus) {
      for (const candidate of menus) {
        if (selected.includes(candidate)) continue;

        const testSelected = [...selected, candidate];
        const testAdditional = calculateTotalNutrition(testSelected);
        const testTotal = addNutrition(baseNutrition, testAdditional, Object.keys(targets));
        const testDistance = calculateDistance(testTotal, targets, { preferences });

        if (testDistance < currentDistance) {
          selected = testSelected;
          currentTotal = testTotal;
          currentDistance = testDistance;
          improved = true;
          console.log(`   [ローカルサーチ] 改善: 1 個追加（距離: ${testDistance.toFixed(2)}）`);
          break;
        }
      }
    }
  }
  
  const additionalNutrition = calculateTotalNutrition(selected);
  const total = addNutrition(baseNutrition, additionalNutrition, Object.keys(targets));
  return {
    selectedMenus: selected,
    totalNutrition: total,
    distance: currentDistance
  };
}

/**
 * メニュー最適化のメイン関数（改良版）
 * 複数の初期条件から始めて、最良の解を返す
 * 固定メニュー、除外メニュー、下限制限に対応
 * 
 * @param {Array} menus - 全メニュー配列
 * @param {Object} targets - 目標値 { キー: 目標値 }
 * @param {Object} options - オプション
 *   - maxMenus: 10（固定メニューを除く追加メニュー数）
 *   - multiStart: 3（マルチスタート回数）
 *   - fixedMenuNames: []（固定メニュー名）
 *   - excludedMenuNames: []（除外メニュー名）
 * @returns {Object} { selectedMenus, fixedMenus, fixedNutrition, additionalMenus, additionalNutrition, totalNutrition, difference, distance, minimumLimits }
 */
function optimizeMenus(menus, targets, options = {}) {
  const maxMenus = options.maxMenus || 10;
  const multiStart = options.multiStart || 3;
  const fixedMenuNames = options.fixedMenuNames || [];
  const excludedMenuNames = options.excludedMenuNames || [];
  const preferences = options.preferences;
  
  console.log(`\n🔍 [最適化開始] メニュー数: ${menus.length}, 目標: ${JSON.stringify(targets)}`);
  console.log(`   設定: 最大メニュー数=${maxMenus}, マルチスタート=${multiStart}`);
  if (fixedMenuNames.length > 0) console.log(`   固定メニュー: ${fixedMenuNames.join(', ')}`);
  if (excludedMenuNames.length > 0) console.log(`   除外メニュー: ${excludedMenuNames.join(', ')}`);
  
  // 固定メニューを探す
  const { found: fixedMenus, notFound: notFoundFixedMenus } = findFixedMenus(menus, fixedMenuNames);
  
  if (notFoundFixedMenus.length > 0) {
    console.warn(`   ⚠️  見つからない固定メニュー: ${notFoundFixedMenus.join(', ')}`);
  }
  
  if (fixedMenus.length > 0) {
    console.log(`   ✅ 固定メニュー ${fixedMenus.length} 個を確認: ${fixedMenus.map(m => m.name).join(', ')}`);
  }
  
  // 固定メニューの合計栄養を計算
  const fixedNutrition = calculateTotalNutrition(fixedMenus);
  console.log(`   固定メニュー合計: ${JSON.stringify(fixedNutrition)}`);
  
  // 下限値を計算
  const minimumLimits = calculateMinimumLimits(fixedNutrition, targets);
  
  // 目標値は「固定込みの総量」で評価する（固定超過も含めて距離に反映）
  
  // 候補メニューを準備（除外・固定を除く）
  const candidateMenus = prepareCandidateMenus(menus, fixedMenus, excludedMenuNames);
  console.log(`   候補メニュー数: ${candidateMenus.length} 個（除外・固定を除く）`);
  
  let bestResult = null;
  let bestDistance = Infinity;
  
  // マルチスタート：異なる初期条件から複数回実行
  for (let start = 0; start < multiStart; start++) {
    console.log(`\n   === マルチスタート ${start + 1}/${multiStart} ===`);
    
    // 貪欲法で初期解を構築
    console.log(`   [貪欲法]`);
    const greedyResult = greedyOptimize(candidateMenus, targets, maxMenus, { baseNutrition: fixedNutrition, preferences });
    
    // ローカルサーチで改善
    console.log(`   [ローカルサーチ]`);
    const improvedResult = localSearch(greedyResult.selectedMenus, candidateMenus, targets, { baseNutrition: fixedNutrition, preferences, maxMenus });
    
    console.log(`   → 距離: ${improvedResult.distance.toFixed(2)}`);
    
    // 最良の解を記録
    if (improvedResult.distance < bestDistance) {
      bestDistance = improvedResult.distance;
      bestResult = improvedResult;
    }
  }
  
  // bestResult.totalNutrition は固定込みの総量
  const totalNutrition = bestResult.totalNutrition;
  const additionalNutrition = calculateTotalNutrition(bestResult.selectedMenus);
  
  // 最終結果を構築
  const difference = calculateDifference(totalNutrition, targets);
  
  console.log(`\n✨ [最適化完了] 距離: ${bestDistance.toFixed(2)}`);
  console.log(`   選択メニュー数: ${bestResult.selectedMenus.length}（固定除く）`);
  console.log(`   全メニュー数: ${fixedMenus.length + bestResult.selectedMenus.length}`);
  
  return {
    selectedMenus: [...fixedMenus, ...bestResult.selectedMenus],
    fixedMenus: fixedMenus,
    fixedNutrition: fixedNutrition,
    additionalMenus: bestResult.selectedMenus,
    additionalNutrition: additionalNutrition,
    totalNutrition: totalNutrition,
    targets: targets,
    minimumLimits: minimumLimits,
    difference: difference,
    distance: bestDistance
  };
}

module.exports = {
  optimizeMenus,
  calculateDistance,
  calculateTotalNutrition,
  calculateDifference,
  findFixedMenus,
  prepareCandidateMenus,
  calculateAdjustedTargets,
  calculateMinimumLimits
};
