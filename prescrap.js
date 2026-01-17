/**
 * メニュープリスクレイピング（Version 2）
 * 
 * 参照: SCRAPER_REBUILD_PLAN.md の「Phase 5: 統合テスト」
 * 複数日分のメニューを事前にキャッシュに保存
 * menus/ ディレクトリに出力
 * 
 * 実行方法:
 *   node prescrap_v2.js          # デフォルト: 5日分
 *   node prescrap_v2.js 3        # 3日分
 */

const fs = require('fs');
const path = require('path');
const { fetchMenus } = require('./src/scraper/fetchMenus');
const { toDateLabel, getNearestWeekday } = require('./src/utils/date');

// 出力ディレクトリ
const OUTPUT_DIR = path.join(__dirname, 'menus');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * キャッシュファイル名を生成
 * 参照: SCRAPER_REBUILD_PLAN.md の「出力ファイル形式」
 * 
 * @param {string} dateLabel - "1/12(月)" 形式
 * @returns {string} "menus_2026-01-12.json" 形式
 */
function getCacheFileName(dateLabel) {
  const today = new Date();
  const [month, day] = dateLabel.match(/(\d{1,2})\/(\d{1,2})/).slice(1).map(Number);
  const year = today.getFullYear() + (month < today.getMonth() + 1 || (month === today.getMonth() + 1 && day < today.getDate()) ? 1 : 0);
  return `menus_${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}.json`;
}

/**
 * メニューを JSON で保存
 * 
 * @param {string} dateLabel - "1/12(月)" 形式
 * @param {Object} data - {dateLabel, count, menus}
 * @returns {void}
 */
function saveMenusToOutput(dateLabel, data) {
  const fileName = getCacheFileName(dateLabel);
  const filePath = path.join(OUTPUT_DIR, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`✅ 保存完了: ${fileName}`);
}

/**
 * 利用可能日付リスト（available-dates.json）を生成
 * 
 * @param {Array<string>} dates - 日付ラベルの配列
 * @returns {void}
 */
function generateAvailableDatesFile(dates) {
  const filePath = path.join(OUTPUT_DIR, 'available-dates.json');
  fs.writeFileSync(filePath, JSON.stringify({ dates: dates.sort() }, null, 2), 'utf-8');
  console.log('✅ available-dates.json を生成しました');
}

/**
 * 複数日分のメニューをプリスクレイピング
 * 参照: SCRAPER_REBUILD_PLAN.md の「Phase 5: 統合テスト」
 * 
 * @param {number} numDays - 取得日数（デフォルト: 5日）
 * @returns {Promise<void>}
 */
async function prescrapMultipleDays(numDays = 5) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔥 メニュープリスクレイピング開始 (${numDays}日間)`);
  console.log(`${'='.repeat(60)}`);

  const scrapedDates = [];
  let date = getNearestWeekday();

  console.log(`🔍 最初の平日: ${toDateLabel(date)}\n`);

  for (let i = 0; i < numDays; i++) {
    const dateLabel = toDateLabel(date);
    console.log(`\n📅 [${i + 1}/${numDays}] ${dateLabel}`);

    try {
      // Phase 4 完了のスクレイピング処理を実行
      const result = await fetchMenus(dateLabel);
      
      // JSON ファイルで保存
      saveMenusToOutput(dateLabel, result);
      console.log(`   ✅ メニュー数: ${result.menus?.length || 0}`);
      
      // 成功した日付をリストに追加
      scrapedDates.push(dateLabel);
      
    } catch (error) {
      console.error(`   ❌ エラー: ${error.message}`);
    }

    // 次の営業日に進む
    do {
      date.setDate(date.getDate() + 1);
    } while (date.getDay() === 0 || date.getDay() === 6);

    // サーバー負荷軽減のためスリープ
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 利用可能日付リストを生成
  generateAvailableDatesFile(scrapedDates);

  console.log('\n' + '='.repeat(60));
  console.log(`📊 プリスクレイピング完了`);
  console.log(`   成功日付数: ${scrapedDates.length}/${numDays}`);
  console.log(`   保存日付: ${scrapedDates.join(', ')}`);
  console.log('='.repeat(60));
}

// 実行
const numDays = parseInt(process.argv[2], 10) || 5;
prescrapMultipleDays(numDays).catch(error => {
  console.error('❌ プリスクレイピングエラー:', error);
  process.exit(1);
});
