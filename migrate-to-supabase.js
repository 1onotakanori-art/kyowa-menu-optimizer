/**
 * 既存の menus/*.json データを Supabase へ一括移行するスクリプト
 *
 * 実行方法:
 *   node migrate-to-supabase.js
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zzleqjendqkoizbdvblw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ 環境変数 SUPABASE_SERVICE_KEY が設定されていません');
  console.error('   export SUPABASE_SERVICE_KEY="your-service-role-key"');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const MENUS_DIR = path.join(__dirname, 'menus');

/**
 * ファイル名から ISO 日付を取得
 * "menus_2026-01-13.json" -> "2026-01-13"
 */
function getDateFromFileName(fileName) {
  const match = fileName.match(/menus_(\d{4}-\d{2}-\d{2})\.json/);
  return match ? match[1] : null;
}

/**
 * 1日分のメニューを Supabase へアップサート
 */
async function uploadDayMenus(date, menus) {
  const rows = menus.map(menu => ({
    date,
    menu_name: menu.name,
    nutrition: menu.nutrition,
  }));

  const { error } = await supabase
    .from('menus')
    .upsert(rows, { onConflict: 'date,menu_name' });

  if (error) throw new Error(`Supabase upsert エラー (${date}): ${error.message}`);
  return rows.length;
}

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 Supabase データ移行開始');
  console.log('='.repeat(60));

  const files = fs.readdirSync(MENUS_DIR)
    .filter(f => f.startsWith('menus_') && f.endsWith('.json'))
    .sort();

  console.log(`📂 対象ファイル数: ${files.length}`);

  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const file of files) {
    const date = getDateFromFileName(file);
    if (!date) {
      console.log(`⚠️  スキップ (日付不明): ${file}`);
      skipCount++;
      continue;
    }

    const filePath = path.join(MENUS_DIR, file);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.error(`❌ JSON 読込エラー: ${file} - ${e.message}`);
      errorCount++;
      continue;
    }

    const menus = data.menus || [];
    if (menus.length === 0) {
      console.log(`⚠️  メニューなし: ${file}`);
      skipCount++;
      continue;
    }

    try {
      const count = await uploadDayMenus(date, menus);
      console.log(`✅ ${date}: ${count} 件アップロード`);
      successCount++;
    } catch (e) {
      console.error(`❌ ${date}: ${e.message}`);
      errorCount++;
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 移行完了`);
  console.log(`   成功: ${successCount} 日`);
  console.log(`   スキップ: ${skipCount} 日`);
  console.log(`   エラー: ${errorCount} 日`);
  console.log('='.repeat(60));
}

main().catch(err => {
  console.error('❌ 移行エラー:', err);
  process.exit(1);
});
