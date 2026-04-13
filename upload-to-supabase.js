#!/usr/bin/env node
/**
 * ローカルメニューデータを Supabase へアップロード
 *
 * 使用方法:
 *   node upload-to-supabase.js              # menus/ 内の全ファイルをアップロード
 *   node upload-to-supabase.js 2026-04-14   # 指定日のみ
 *   node upload-to-supabase.js 2026-04-13 2026-04-14  # 複数日指定
 *
 * 前提条件:
 *   SUPABASE_SERVICE_KEY 環境変数が設定されていること
 */

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://zzleqjendqkoizbdvblw.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ エラー: SUPABASE_SERVICE_KEY が設定されていません。');
  console.error('   export SUPABASE_SERVICE_KEY="your-service-role-key" を実行してください。');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const MENUS_DIR = path.join(__dirname, 'menus');

/**
 * 1日分のメニューを Supabase へアップサート
 * @param {string} date - "2026-04-14" 形式
 * @param {Array} menus - [{name, nutrition}] 配列
 * @returns {Promise<number>} アップロード件数
 */
async function uploadToSupabase(date, menus) {
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
 * ファイル名から日付文字列を抽出
 * "menus_2026-04-14.json" → "2026-04-14"
 */
function dateFromFileName(fileName) {
  const match = fileName.match(/menus_(\d{4}-\d{2}-\d{2})\.json$/);
  return match ? match[1] : null;
}

async function main() {
  // CLI 引数で日付指定があればそれを使用、なければ全ファイル
  const args = process.argv.slice(2);

  let files;
  if (args.length > 0) {
    // 指定日のファイルのみ
    files = args.map(date => `menus_${date}.json`).filter(f => {
      const exists = fs.existsSync(path.join(MENUS_DIR, f));
      if (!exists) console.warn(`⚠️  ファイルが見つかりません: ${f}`);
      return exists;
    });
  } else {
    // menus/ 内の全 menus_*.json ファイル
    files = fs.readdirSync(MENUS_DIR)
      .filter(f => /^menus_\d{4}-\d{2}-\d{2}\.json$/.test(f))
      .sort();
  }

  if (files.length === 0) {
    console.error('❌ アップロード対象のファイルがありません。');
    process.exit(1);
  }

  console.log(`📤 ${files.length} 件のファイルを Supabase へアップロードします...\n`);

  let successCount = 0;
  let failCount = 0;
  let totalMenus = 0;

  for (const fileName of files) {
    const date = dateFromFileName(fileName);
    if (!date) continue;

    const filePath = path.join(MENUS_DIR, fileName);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch (e) {
      console.error(`❌ 読み込み失敗: ${fileName} - ${e.message}`);
      failCount++;
      continue;
    }

    const menus = data.menus || [];
    if (menus.length === 0) {
      console.log(`⏭️  スキップ (メニューなし): ${fileName}`);
      continue;
    }

    try {
      const uploaded = await uploadToSupabase(date, menus);
      console.log(`✅ ${date}: ${uploaded} 件アップロード`);
      totalMenus += uploaded;
      successCount++;
    } catch (e) {
      console.error(`❌ ${date}: ${e.message}`);
      failCount++;
    }
  }

  console.log(`\n📊 完了: 成功 ${successCount} 日 / 失敗 ${failCount} 日 / 合計 ${totalMenus} メニュー`);
  if (failCount > 0) process.exit(1);
}

main().catch(e => {
  console.error('❌ 予期しないエラー:', e.message);
  process.exit(1);
});
