/**
 * メニュープリスクレイピング
 * 複数日分のメニューを事前にキャッシュに保存
 * GitHub Pages 用に docs/menus/ に出力
 */

const fs = require('fs');
const path = require('path');
const { fetchMenus } = require('./src/scraper/fetchMenus');
const { toDateLabel, getNearestWeekday } = require('./src/utils/date');

// 出力ディレクトリ（GitHub Pages 用）
const OUTPUT_DIR = path.join(__dirname, 'docs', 'menus');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * キャッシュファイル名を生成
 */
function getCacheFileName(dateLabel) {
  const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) return null;
  
  // 2026年を想定（実装では相対的に計算）
  const today = new Date();
  const month = parseInt(match[1]);
  const day = parseInt(match[2]);
  
  let year = today.getFullYear();
  if (month < today.getMonth() + 1 || (month === today.getMonth() + 1 && day < today.getDate())) {
    year = today.getFullYear() + 1;
  }
  
  const monthStr = String(month).padStart(2, '0');
  const dayStr = String(day).padStart(2, '0');
  return `menus_${year}-${monthStr}-${dayStr}.json`;
}

/**
 * メニューを docs/menus/ に保存
 */
function saveMenusToOutput(dateLabel, data) {
  try {
    const fileName = getCacheFileName(dateLabel);
    if (!fileName) {
      console.error(`❌ 日付フォーマットエラー: ${dateLabel}`);
      return false;
    }
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`✅ メニュー保存: ${fileName}`);
    return true;
  } catch (error) {
    console.error(`❌ メニュー保存エラー (${dateLabel}):`, error.message);
    return false;
  }
}

/**
 * 複数日のメニューをスクレイプ
 */
async function prescrapMultipleDays(numDays = 10) {
  console.log(`\n🔥 メニュープリスクレイピング開始 (${numDays}日間)`);
  console.log('='.repeat(60));

  let date = getNearestWeekday();
  let successCount = 0;
  let failureCount = 0;
  const scrapedDates = [];

  for (let i = 0; i < numDays; i++) {
    const dateLabel = toDateLabel(date);
    console.log(`\n📅 [${i + 1}/${numDays}] ${dateLabel}`);

    try {
      const result = await fetchMenus(dateLabel);
      if (saveMenusToOutput(dateLabel, result)) {
        console.log(`   メニュー数: ${result.menus?.length || 0}`);
        successCount++;
        scrapedDates.push(dateLabel);
      } else {
        failureCount++;
      }
    } catch (error) {
      console.error(`   ❌ エラー: ${error.message}`);
      failureCount++;
    }

    // 次の営業日に進む
    date.setDate(date.getDate() + 1);
    // 日曜日（0）と土曜日（6）をスキップ
    while (date.getDay() === 0 || date.getDay() === 6) {
      date.setDate(date.getDate() + 1);
    }

    // サーバーに優しく、スリープを入れる
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // available-dates.json を生成
  generateAvailableDatesFile(scrapedDates);

  console.log('\n' + '='.repeat(60));
  console.log(`📊 プリスクレイピング完了`);
  console.log(`   成功: ${successCount}, 失敗: ${failureCount}`);
  console.log(`   保存日付: ${scrapedDates.join(', ')}`);
  console.log('='.repeat(60) + '\n');
}

/**
 * available-dates.json ファイルを生成
 */
function generateAvailableDatesFile(dates) {
  try {
    const filePath = path.join(__dirname, 'docs', 'available-dates.json');
    const data = { dates: dates.sort() };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`\n✅ available-dates.json を生成しました`);
  } catch (error) {
    console.error(`❌ available-dates.json 生成エラー:`, error.message);
  }
}

// 実行
prescrapMultipleDays(10).catch(error => {
  console.error('❌ プリスクレイピングエラー:', error);
  process.exit(1);
});
