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
const { fetchMenus, getAvailableSiteDates } = require('./src/scraper/fetchMenus');
const { createClient } = require('@supabase/supabase-js');

// Supabase クライアント（SERVICE_KEY があればアップロード、なければローカル保存のみ）
const SUPABASE_URL = 'https://zzleqjendqkoizbdvblw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = SUPABASE_SERVICE_KEY ? createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY) : null;

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
 * 1日分のメニューを Supabase へアップサート
 *
 * @param {string} date - "2026-01-13" 形式
 * @param {Array} menus - [{name, nutrition}] 配列
 * @returns {Promise<number>} アップロード件数
 */
async function uploadToSupabase(date, menus) {
  if (!supabase) return 0;
  const rows = menus.map(menu => ({
    date,
    menu_name: menu.name,
    nutrition: menu.nutrition,
  }));
  const { error } = await supabase
    .from('menus')
    .upsert(rows, { onConflict: 'date,menu_name' });
  if (error) throw new Error(`Supabase upsert エラー: ${error.message}`);
  return rows.length;
}

/**
 * 利用可能日付リスト（available-dates.json）を生成
 * 既存のファイルがある場合はマージする
 *
 * @param {Array<string>} newDateLabels - 新しくスクレイプした日付ラベルの配列
 * @returns {void}
 */
function generateAvailableDatesFile(newDateLabels) {
  const filePath = path.join(OUTPUT_DIR, 'available-dates.json');

  // 新しい日付ラベルを YYYY-MM-DD 形式に変換
  const newDates = newDateLabels.map(label => {
    const fileName = getCacheFileName(label);
    // "menus_2026-01-12.json" -> "2026-01-12"
    return fileName.replace('menus_', '').replace('.json', '');
  });

  // 既存の日付を読み込んでマージ
  let existingDates = [];
  if (fs.existsSync(filePath)) {
    try {
      const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      existingDates = existing.dates || [];
    } catch (e) {
      console.log('⚠️  既存の available-dates.json の読み込みに失敗。新規作成します。');
    }
  }

  // 重複を除いてマージし、ソート
  const allDates = [...new Set([...existingDates, ...newDates])].sort();

  fs.writeFileSync(filePath, JSON.stringify({ dates: allDates }, null, 2), 'utf-8');
  console.log(`✅ available-dates.json を更新しました（合計 ${allDates.length} 日分）`);
}

/**
 * サイトから利用可能な平日の日付を取得してスクレイピング
 * ローカルでの日付計算ではなく、サイトが実際に提供する日付を使用
 *
 * @param {number} maxDays - 最大取得日数（デフォルト: 5日）
 * @returns {Promise<void>}
 */
async function prescrapMultipleDays(maxDays = 5) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🔥 メニュープリスクレイピング開始 (最大${maxDays}日間)`);
  console.log(`${'='.repeat(60)}`);

  // サイトから利用可能な日付を取得
  console.log('🌐 サイトから利用可能な日付を取得中...');
  const allSiteDates = await getAvailableSiteDates();

  // 今日の月/日を取得
  const now = new Date();
  const todayMonth = now.getMonth() + 1;
  const todayDay = now.getDate();

  // 平日かつ今日以降のみフィルタ
  const weekdayLabels = allSiteDates.filter(label => {
    if (label.includes('(土)') || label.includes('(日)')) return false;
    // "4/13(月)" 形式をパース
    const m = label.match(/^(\d{1,2})\/(\d{1,2})/);
    if (!m) return false;
    const month = parseInt(m[1], 10);
    const day = parseInt(m[2], 10);
    // 月が小さければ翌年扱い（12月→1月などの年またぎ対応）
    if (month !== todayMonth) {
      // 月差が6超なら年またぎと判断（1月 vs 12月 など）
      const diff = month - todayMonth;
      return diff > 0 ? true : diff < -6;
    }
    return day >= todayDay;
  });

  // 指定日数分に制限
  const targetDates = weekdayLabels.slice(0, maxDays);
  console.log(`📅 スクレイプ対象: ${targetDates.join(', ')} (${targetDates.length}日)\n`);

  const scrapedDates = [];

  for (let i = 0; i < targetDates.length; i++) {
    const dateLabel = targetDates[i];
    console.log(`\n📅 [${i + 1}/${targetDates.length}] ${dateLabel}`);

    try {
      const result = await fetchMenus(dateLabel);
      saveMenusToOutput(dateLabel, result);
      const menuCount = result.menus?.length || 0;
      console.log(`   ✅ メニュー数: ${menuCount}`);

      // Supabase へアップロード
      if (supabase) {
        const isoDate = getCacheFileName(dateLabel).replace('menus_', '').replace('.json', '');
        try {
          const uploaded = await uploadToSupabase(isoDate, result.menus || []);
          console.log(`   ☁️  Supabase アップロード: ${uploaded} 件`);
        } catch (uploadError) {
          console.error(`   ⚠️  Supabase アップロード失敗: ${uploadError.message}`);
        }
      } else {
        console.log(`   ℹ️  SUPABASE_SERVICE_KEY 未設定のため Supabase アップロードをスキップ`);
      }

      scrapedDates.push(dateLabel);
    } catch (error) {
      console.error(`   ❌ エラー: ${error.message}`);
    }

    // サーバー負荷軽減のためスリープ
    if (i < targetDates.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 利用可能日付リストを生成
  generateAvailableDatesFile(scrapedDates);

  console.log('\n' + '='.repeat(60));
  console.log(`📊 プリスクレイピング完了`);
  console.log(`   成功日付数: ${scrapedDates.length}/${targetDates.length}`);
  console.log(`   保存日付: ${scrapedDates.join(', ')}`);
  console.log('='.repeat(60));
}

// 実行
const numDays = parseInt(process.argv[2], 10) || 5;
prescrapMultipleDays(numDays).catch(error => {
  console.error('❌ プリスクレイピングエラー:', error);
  process.exit(1);
});

