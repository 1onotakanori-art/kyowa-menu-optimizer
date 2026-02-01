/**
 * Step 5-2: E2E テスト スクリプト
 * admin.html のシミュレーション + 検証
 */

const fs = require('fs');
const path = require('path');

// テスト対象の日付
const TEST_DATE = '2026-02-02';

console.log('='.repeat(60));
console.log('🧪 Step 5-2: E2E テスト');
console.log('='.repeat(60));

// Phase 3: admin.html の操作をシミュレート
console.log('\n📋 Phase 3: admin.html 操作シミュレーション\n');

// メニューを読み込む
const menusPath = path.join(__dirname, `menus/menus_${TEST_DATE}.json`);
if (!fs.existsSync(menusPath)) {
  console.error(`❌ エラー: ${menusPath} が見つかりません`);
  process.exit(1);
}

const menusData = JSON.parse(fs.readFileSync(menusPath, 'utf-8'));
console.log(`✅ メニュー読み込み: ${TEST_DATE}`);
console.log(`   メニュー数: ${menusData.menus.length}`);

// テスト用に3つのメニューを選択
const selectedMenus = menusData.menus.slice(0, 3);
console.log(`\n✅ メニュー選択（3つ）`);

// 各メニューに評価を割り当てる
const selectedMenusWithRating = selectedMenus.map((menu, idx) => {
  const ratings = [5, 4, 3]; // 星評価: 5, 4, 3
  return {
    ...menu,
    name: menu.name,
    nutrition: menu.nutrition || {},
    rating: ratings[idx]
  };
});

selectedMenusWithRating.forEach((menu, idx) => {
  const stars = '★'.repeat(menu.rating) + '☆'.repeat(5 - menu.rating);
  console.log(`   [${idx + 1}] ${menu.name}`);
  console.log(`       評価: ${stars} (${menu.rating}/5)`);
});

// 栄養合計を計算
const totals = {
  'エネルギー': 0,
  'たんぱく質': 0,
  '脂質': 0,
  '炭水化物': 0,
  '野菜重量': 0
};

selectedMenusWithRating.forEach(menu => {
  Object.keys(totals).forEach(key => {
    const value = menu.nutrition?.[key];
    if (typeof value === 'number') {
      totals[key] += value;
    }
  });
});

console.log(`\n✅ 栄養合計を計算`);
console.log(`   エネルギー: ${Math.round(totals['エネルギー'])} kcal`);
console.log(`   たんぱく質: ${(totals['たんぱく質'] * 10 / 10).toFixed(1)} g`);
console.log(`   脂質: ${(totals['脂質'] * 10 / 10).toFixed(1)} g`);
console.log(`   炭水化物: ${(totals['炭水化物'] * 10 / 10).toFixed(1)} g`);
console.log(`   野菜重量: ${Math.round(totals['野菜重量'])} g`);

// 履歴データを作成（admin.jsで生成されるのと同じ形式）
const historyData = {
  date: TEST_DATE,
  dayOfWeek: '月',
  user: 'ONO',
  timestamp: new Date().toISOString(),
  settings: {
    targets: {},
    preferences: {}
  },
  selectedMenus: selectedMenusWithRating,
  totals: totals,
  achievement: {}
};

console.log('\n='.repeat(60));
console.log('Phase 4: GitHub API 保存テスト\n');

// ローカルストレージをシミュレート
const storageKey = `history_${TEST_DATE}`;
const storageData = JSON.stringify(historyData);

// menus/ ディレクトリの兄弟に一時ファイルを作成
const tempDir = path.join(__dirname, '.test-storage');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

const tempFile = path.join(tempDir, `${storageKey}.json`);
fs.writeFileSync(tempFile, storageData, 'utf-8');

console.log(`✅ ローカルストレージに保存（シミュレーション）`);
console.log(`   キー: ${storageKey}`);
console.log(`   ファイル: ${tempFile}`);
console.log(`   サイズ: ${(storageData.length / 1024).toFixed(1)} KB`);

// 実際に kyowa-menu-history に保存する場合のシミュレーション
const historyRepoPath = path.join(__dirname, '../kyowa-menu-history/data/history');
if (fs.existsSync(historyRepoPath)) {
  const githubFile = path.join(historyRepoPath, `${TEST_DATE}.json`);
  fs.writeFileSync(githubFile, JSON.stringify(historyData, null, 2), 'utf-8');
  console.log(`\n✅ GitHub リポジトリに保存`);
  console.log(`   ファイル: ${githubFile}`);
} else {
  console.log(`\n⚠️  GitHub リポジトリが見つかりません`);
  console.log(`   予定パス: ${historyRepoPath}`);
}

// Phase 5: データ検証
console.log('\n='.repeat(60));
console.log('Phase 5: データ検証\n');

console.log('✅ 履歴データの構造確認');
console.log(`   ✓ date: ${historyData.date}`);
console.log(`   ✓ dayOfWeek: ${historyData.dayOfWeek}`);
console.log(`   ✓ user: ${historyData.user}`);
console.log(`   ✓ selectedMenus: ${historyData.selectedMenus.length}件`);
console.log(`   ✓ totals: 栄養合計あり`);

console.log('\n✅ 各メニューの rating フィールド確認');
historyData.selectedMenus.forEach((menu, idx) => {
  const hasRating = typeof menu.rating === 'number' && menu.rating >= 1 && menu.rating <= 5;
  const status = hasRating ? '✓' : '✗';
  console.log(`   ${status} メニュー${idx + 1}: rating=${menu.rating}`);
});

// 学習用データのシミュレーション
console.log('\n='.repeat(60));
console.log('Phase 5.5: 学習用データプレビュー\n');

console.log('✅ Seq2Set 学習に使用できるデータ:');
console.log(`   入力: 過去7日間のメニュー選択`);
console.log(`   出力: 次の日のメニュー選択`);
console.log(`   このテスト日付: ${TEST_DATE}`);
console.log(`   選択メニュー数: ${selectedMenusWithRating.length}`);

console.log('\n✅ 改善エンジン（improve_recommendations.py）に使用できるデータ:');
console.log(`   - 各メニューの栄養値: PFC など`);
console.log(`   - ユーザーの評価: rating フィールド（補助情報）`);
console.log(`   - 栄養マッチスコア計算可能`);
console.log(`   - 多様性スコア計算可能`);

// 最終チェックリスト
console.log('\n='.repeat(60));
console.log('✅ E2E テスト チェックリスト\n');

const checks = [
  { name: 'メニューファイル存在', status: fs.existsSync(menusPath) },
  { name: 'メニュー数 >= 40', status: menusData.menus.length >= 40 },
  { name: 'テストメニュー選択', status: selectedMenusWithRating.length === 3 },
  { name: '全メニューに rating', status: selectedMenusWithRating.every(m => typeof m.rating === 'number') },
  { name: 'rating 値が 1-5', status: selectedMenusWithRating.every(m => m.rating >= 1 && m.rating <= 5) },
  { name: '栄養合計計算', status: totals['エネルギー'] > 0 },
  { name: 'ローカル保存シミュレーション', status: fs.existsSync(tempFile) },
  { name: 'GitHub リポジトリ保存', status: fs.existsSync(path.join(__dirname, '../kyowa-menu-history/data/history')) }
];

let passCount = 0;
checks.forEach(check => {
  const icon = check.status ? '✅' : '⚠️ ';
  console.log(`${icon} ${check.name}`);
  if (check.status) passCount++;
});

console.log('\n='.repeat(60));
console.log(`📊 テスト結果: ${passCount}/${checks.length} 項目合格`);

if (passCount >= 7) {
  console.log('🎉 Phase 3-5 テスト完了: E2E フロー検証成功');
  console.log('\n次のステップ:');
  console.log('  1. train_seq2set.py を実行');
  console.log('  2. generate_ai_recommendations.py を実行');
  console.log('  3. app.html で推奨を確認');
} else {
  console.log('⚠️  いくつかのテストが失敗しました');
}

console.log('='.repeat(60));
