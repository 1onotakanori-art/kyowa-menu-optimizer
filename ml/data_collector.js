/**
 * データ収集スクリプト
 * 全メニューデータと選択履歴データを統合します
 */

const fs = require('fs');
const path = require('path');

// パス設定
const MENUS_DIR = path.join(__dirname, '../menus');
const HISTORY_DIR = path.join(__dirname, '../../kyowa-menu-history/kyowa-menu-history/data/history');
const OUTPUT_DIR = path.join(__dirname, 'data');

// 出力ディレクトリ作成
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 利用可能な日付を取得
 */
function getAvailableDates() {
  const menuFiles = fs.readdirSync(MENUS_DIR)
    .filter(f => f.startsWith('menus_') && f.endsWith('.json'))
    .map(f => f.replace('menus_', '').replace('.json', ''))
    .sort();

  const historyFiles = fs.readdirSync(HISTORY_DIR)
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort();

  // 両方に存在する日付のみ
  const commonDates = menuFiles.filter(date => historyFiles.includes(date));

  console.log(`📊 全メニュー: ${menuFiles.length}日分`);
  console.log(`📊 選択履歴: ${historyFiles.length}日分`);
  console.log(`✅ 統合可能: ${commonDates.length}日分`);
  console.log(`📅 日付範囲: ${commonDates[0]} ~ ${commonDates[commonDates.length - 1]}`);

  return commonDates;
}

/**
 * データを統合
 */
function mergeData(date) {
  // 全メニューデータを読み込み
  const menusPath = path.join(MENUS_DIR, `menus_${date}.json`);
  const menusData = JSON.parse(fs.readFileSync(menusPath, 'utf-8'));

  // 選択履歴データを読み込み
  const historyPath = path.join(HISTORY_DIR, `${date}.json`);
  const historyData = JSON.parse(fs.readFileSync(historyPath, 'utf-8'));

  // 選択されたメニュー名のリストを取得（新旧形式両対応）
  let selectedMenuNames = [];
  if (historyData.selectedMenus && Array.isArray(historyData.selectedMenus)) {
    // 新形式
    selectedMenuNames = historyData.selectedMenus.map(m => m.name);
  } else if (historyData.eaten && Array.isArray(historyData.eaten)) {
    // 旧形式
    selectedMenuNames = historyData.eaten;
  }

  // データを統合
  const mergedData = {
    date: date,
    dateLabel: menusData.dateLabel,
    dayOfWeek: historyData.dayOfWeek || null,
    allMenus: menusData.menus.map(menu => ({
      name: menu.name,
      nutrition: menu.nutrition,
      selected: selectedMenuNames.includes(menu.name)
    })),
    selectedCount: selectedMenuNames.length,
    totalNutrition: historyData.totals || historyData.nutrition?.total || null,
    timestamp: historyData.timestamp || null
  };

  return mergedData;
}

/**
 * 全データを統合してJSONファイルに出力
 */
function collectAllData() {
  console.log('🚀 データ収集を開始します...\n');

  const dates = getAvailableDates();
  const allData = [];

  console.log('\n📦 データを統合中...');
  dates.forEach((date, index) => {
    try {
      const merged = mergeData(date);
      allData.push(merged);
      console.log(`✅ [${index + 1}/${dates.length}] ${date} - ${merged.allMenus.length}メニュー, ${merged.selectedCount}選択`);
    } catch (error) {
      console.error(`❌ [${index + 1}/${dates.length}] ${date} - エラー:`, error.message);
    }
  });

  // JSON形式で保存
  const outputPath = path.join(OUTPUT_DIR, 'training_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2), 'utf-8');
  console.log(`\n✅ 統合データを保存しました: ${outputPath}`);
  console.log(`📊 総データ数: ${allData.length}日分`);

  // サマリー情報を生成
  const summary = {
    totalDays: allData.length,
    dateRange: {
      start: allData[0]?.date,
      end: allData[allData.length - 1]?.date
    },
    totalMenus: allData.reduce((sum, d) => sum + d.allMenus.length, 0),
    totalSelections: allData.reduce((sum, d) => sum + d.selectedCount, 0),
    avgMenusPerDay: (allData.reduce((sum, d) => sum + d.allMenus.length, 0) / allData.length).toFixed(1),
    avgSelectionsPerDay: (allData.reduce((sum, d) => sum + d.selectedCount, 0) / allData.length).toFixed(1)
  };

  const summaryPath = path.join(OUTPUT_DIR, 'data_summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), 'utf-8');
  console.log(`\n📋 サマリー情報:`);
  console.log(JSON.stringify(summary, null, 2));

  return { allData, summary };
}

// スクリプト実行
if (require.main === module) {
  collectAllData();
}

module.exports = { getAvailableDates, mergeData, collectAllData };
