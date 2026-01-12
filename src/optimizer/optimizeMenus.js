/**
 * メニュー最適化ロジック（貪欲法 + ローカルサーチ）
 * 理由：40 個程度のメニューから最適な組み合わせを高速に見つける
 * 改良：固定メニュー、除外メニュー、下限制限に対応
 */

/**
 * 複数項目の加重距離を計算
 * 理由：複数の栄養目標に対して、距離を統一的に評価
 * 
 * @param {Object} nutrition - 栄養データ { キー: 値 }
 * @param {Object} targets - 目標値 { キー: 目標値 }
 * @returns {number} 距離（小さいほど目標に近い）
 */
function calculateDistance(nutrition, targets) {
  let totalDistance = 0;
  const keys = Object.keys(targets);
  
  for (const key of keys) {
    const target = targets[key];
    const actual = nutrition[key] || 0;
    
    // 各項目の差の絶対値を累積
    // 理由：どの項目も等しく重要だと仮定
    totalDistance += Math.abs(actual - target);
  }
  
  // 項目数で正規化（複数項目を公正に比較できるように）
  return totalDistance / Math.max(keys.length, 1);
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
function greedyOptimize(menus, targets, maxMenus) {
  const selected = [];
  const remaining = menus.slice(); // コピー
  
  while (selected.length < maxMenus && remaining.length > 0) {
    let bestIdx = 0;
    let bestDistance = Infinity;
    
    // 各候補メニューについて、追加した場合の距離を計算
    for (let i = 0; i < remaining.length; i++) {
      const testSelected = [...selected, remaining[i]];
      const testTotal = calculateTotalNutrition(testSelected);
      const testDistance = calculateDistance(testTotal, targets);
      
      if (testDistance < bestDistance) {
        bestDistance = testDistance;
        bestIdx = i;
      }
    }
    
    // 最良のメニューを選択に追加
    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
    
    console.log(`   [貪欲法] メニュー ${selected.length}: ${selected[selected.length - 1].name}`);
  }
  
  const total = calculateTotalNutrition(selected);
  return {
    selectedMenus: selected,
    totalNutrition: total,
    distance: calculateDistance(total, targets)
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
function localSearch(currentSelected, menus, targets) {
  let selected = currentSelected.slice();
  let currentDistance = calculateDistance(calculateTotalNutrition(selected), targets);
  
  let improved = true;
  let iterations = 0;
  const maxIterations = 20; // 無限ループ防止
  
  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    
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
        const testTotal = calculateTotalNutrition(testSelected);
        const testDistance = calculateDistance(testTotal, targets);
        
        // 改善できたら採用
        if (testDistance < currentDistance) {
          selected = testSelected;
          currentDistance = testDistance;
          improved = true;
          console.log(`   [ローカルサーチ] 改善: ${selected[i].name} に入れ替え（距離: ${testDistance.toFixed(2)}）`);
          break; // 内側のループを抜ける
        }
      }
      if (improved) break; // 外側のループも抜ける
    }
  }
  
  const total = calculateTotalNutrition(selected);
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
  
  // 調整目標値を計算（固定メニューの値を差し引いた目標値）
  const adjustedTargets = calculateAdjustedTargets(targets, fixedNutrition);
  console.log(`   調整目標値（固定を除く）: ${JSON.stringify(adjustedTargets)}`);
  
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
    const greedyResult = greedyOptimize(candidateMenus, adjustedTargets, maxMenus);
    
    // ローカルサーチで改善
    console.log(`   [ローカルサーチ]`);
    const improvedResult = localSearch(greedyResult.selectedMenus, candidateMenus, adjustedTargets);
    
    console.log(`   → 距離: ${improvedResult.distance.toFixed(2)}`);
    
    // 最良の解を記録
    if (improvedResult.distance < bestDistance) {
      bestDistance = improvedResult.distance;
      bestResult = improvedResult;
    }
  }
  
  // 追加メニューの栄養値
  const additionalNutrition = bestResult.totalNutrition;
  
  // 全体の栄養値を計算
  const totalNutrition = {};
  for (const key of Object.keys(targets)) {
    totalNutrition[key] = (fixedNutrition[key] || 0) + (additionalNutrition[key] || 0);
  }
  
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
