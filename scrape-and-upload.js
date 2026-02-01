#!/usr/bin/env node
/**
 * メニュースクレイプ & アップロードスクリプト
 * 
 * 機能:
 * - メニューをスクレイピング
 * - ローカルリポジトリの既存データと比較
 * - 更新されたデータのみを Git にコミット・プッシュ
 * 
 * 実行方法:
 *   node scrape-and-upload.js [日数]
 * 
 * 例:
 *   node scrape-and-upload.js      # デフォルト5日分
 *   node scrape-and-upload.js 10   # 10日分
 * 
 * 前提条件:
 *   - kyowa-menu-history リポジトリへのアクセス権限（SSH key設定済み）
 *   - Git がインストール済み
 * 
 * アップロード先:
 *   - GitHub: kyowa-menu-history/data/menus/
 *   - ローカルキャッシュ: menus/
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { fetchMenus } = require('./src/scraper/fetchMenus');
const { toDateLabel, getNearestWeekday } = require('./src/utils/date');

// kyowa-menu-history リポジトリのパス（並列リポジトリ）
const HISTORY_REPO_DIR = path.join(__dirname, '..', 'kyowa-menu-history');

// 出力ディレクトリ
const OUTPUT_DIR = path.join(__dirname, 'menus');

/**
 * ディレクトリが存在しない場合は作成
 */
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Git リポジトリを最新状態に更新
 */
function syncGitRepo() {
  if (!fs.existsSync(HISTORY_REPO_DIR)) {
    throw new Error(
      `kyowa-menu-history リポジトリが見つかりません。\n` +
      `期待されるパス: ${HISTORY_REPO_DIR}\n` +
      `リポジトリをクローンしてください:\n` +
      `  cd ${path.dirname(HISTORY_REPO_DIR)}\n` +
      `  git clone git@github.com:1onotakanori-art/kyowa-menu-history.git`
    );
  }
  
  try {
    execSync('git pull origin main', {
      cwd: HISTORY_REPO_DIR,
      stdio: 'pipe'
    });
  } catch (error) {
    console.log('   ⚠️  プルに失敗:', error.message);
    console.log('   リポジトリはそのまま使用します');
  }
}

/**
 * ファイル内容を比較
 */
function hasContentChanged(localPath, remotePath) {
  if (!fs.existsSync(remotePath)) {
    return true;
  }
  
  const localContent = fs.readFileSync(localPath, 'utf-8');
  const remoteContent = fs.readFileSync(remotePath, 'utf-8');
  
  // JSON の場合は正規化して比較
  try {
    const localJson = JSON.parse(localContent);
    const remoteJson = JSON.parse(remoteContent);
    return JSON.stringify(localJson) !== JSON.stringify(remoteJson);
  } catch (error) {
    // JSON パースエラーの場合は文字列比較
    return localContent.trim() !== remoteContent.trim();
  }
}

/**
 * キャッシュファイル名を生成（YYYY-MM-DD形式）
 * 
 * @param {string} dateLabel - "1/12(月)" 形式
 * @returns {string} "2026-01-12" 形式
 */
function getDateString(dateLabel) {
  const today = new Date();
  const match = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
  if (!match) {
    throw new Error(`Invalid date label: ${dateLabel}`);
  }
  
  const [, month, day] = match.map(Number);
  let year = today.getFullYear();
  
  // 月が現在より小さい、または同じ月で日が過去の場合は翌年
  if (month < today.getMonth() + 1 || 
      (month === today.getMonth() + 1 && day < today.getDate())) {
    year++;
  }
  
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * メニューをスクレイピングしてローカルに保存
 * 
 * @param {string} dateLabel - "1/12(月)" 形式
 * @returns {Promise<{dateString: string, data: Object, filePath: string}>}
 */
async function scrapeAndSaveMenu(dateLabel) {
  console.log(`📅 スクレイピング中: ${dateLabel}`);
  
  try {
    // メニュー取得
    const menuData = await fetchMenus(dateLabel);
    const dateString = getDateString(dateLabel);
    const fileName = `menus_${dateString}.json`;
    const filePath = path.join(OUTPUT_DIR, fileName);
    
    // ローカルに保存
    ensureDir(OUTPUT_DIR);
    fs.writeFileSync(filePath, JSON.stringify(menuData, null, 2), 'utf-8');
    
    console.log(`   ✅ メニュー数: ${menuData.menus?.length || 0}`);
    
    return {
      dateString: dateString,
      data: menuData,
      filePath: filePath
    };
  } catch (error) {
    console.error(`   ❌ エラー: ${error.message}`);
    throw error;
  }
}

/**
 * GitHub リポジトリにファイルをコピーして差分があるかチェック
 * 
 * @param {string} dateString - "2026-01-12" 形式
 * @param {string} localPath - ローカルファイルパス
 * @returns {'new'|'updated'|'unchanged'}
 */
function copyToRepoIfChanged(dateString, localPath) {
  const repoMenusDir = path.join(HISTORY_REPO_DIR, 'data', 'menus');
  ensureDir(repoMenusDir);
  
  const remotePath = path.join(repoMenusDir, `${dateString}.json`);
  
  if (!fs.existsSync(remotePath)) {
    // 新規ファイル
    fs.copyFileSync(localPath, remotePath);
    console.log(`   📤 リポジトリにコピー: ${dateString}.json (新規)`);
    return 'new';
  }
  
  // 内容が変わっているかチェック
  if (hasContentChanged(localPath, remotePath)) {
    fs.copyFileSync(localPath, remotePath);
    console.log(`   📤 リポジトリにコピー: ${dateString}.json (更新)`);
    return 'updated';
  }
  
  console.log(`   ⏭️  ${dateString}.json (変更なし)`);
  return 'unchanged';
}

/**
 * available-dates.json を生成してリポジトリにコピー
 * 
 * @param {Array<string>} dateStrings - "2026-01-12" 形式の日付配列
 */
function updateAvailableDates(dateStrings) {
  console.log('\n📅 available-dates.json を更新中...');
  
  const availableDatesData = {
    dates: dateStrings.sort()
  };
  
  const localPath = path.join(OUTPUT_DIR, 'available-dates.json');
  const remotePath = path.join(HISTORY_REPO_DIR, 'data', 'menus', 'available-dates.json');
  const content = JSON.stringify(availableDatesData, null, 2);
  
  // ローカルに保存
  fs.writeFileSync(localPath, content, 'utf-8');
  
  // リポジトリにコピー
  if (!fs.existsSync(remotePath) || hasContentChanged(localPath, remotePath)) {
    fs.copyFileSync(localPath, remotePath);
    console.log('   ✅ リポジトリにコピー完了');
    return true;
  } else {
    console.log('   ⏭️  変更なし');
    return false;
  }
}

/**
 * メイン処理
 */
async function main() {
  const numDays = parseInt(process.argv[2], 10) || 5;
  
  console.log('========================================');
  console.log('メニュースクレイプ & アップロード');
  console.log('========================================');
  console.log(`対象日数: ${numDays}日\n`);
  
  const results = {
    success: [],
    failed: [],
    new: 0,
    updated: 0,
    unchanged: 0
  };
  
  try {
    // Git リポジトリを同期
    console.log('📦 kyowa-menu-history リポジトリを同期中...');
    syncGitRepo();
    console.log('   ✅ 同期完了\n');
    
    let date = getNearestWeekday();
    
    for (let i = 0; i < numDays; i++) {
      const dateLabel = toDateLabel(date);
      console.log(`\n[${i + 1}/${numDays}] ${dateLabel}`);
      
      try {
        // スクレイピング
        const { dateString, data, filePath } = await scrapeAndSaveMenu(dateLabel);
        
        // リポジトリにコピー
        const copyStatus = copyToRepoIfChanged(dateString, filePath);
        
        results.success.push(dateString);
        if (copyStatus === 'new') results.new++;
        else if (copyStatus === 'updated') results.updated++;
        else results.unchanged++;
        
      } catch (error) {
        results.failed.push({ dateLabel, error: error.message });
      }
      
      // 次の平日へ
      do {
        date.setDate(date.getDate() + 1);
      } while (date.getDay() === 0 || date.getDay() === 6);
      
      // サーバー負荷軽減
      if (i < numDays - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    // available-dates.json を更新
    let hasChanges = false;
    if (results.success.length > 0) {
      hasChanges = updateAvailableDates(results.success) || results.new > 0 || results.updated > 0;
    }
    
    // Git にコミット & プッシュ
    if (hasChanges) {
      console.log('\n🚀 変更を GitHub にプッシュ中...');
      try {
        execSync('git add data/menus/', {
          cwd: HISTORY_REPO_DIR,
          stdio: 'pipe'
        });
        
        const commitMessage = `Update menu data (${results.new} new, ${results.updated} updated)`;
        execSync(`git commit -m "${commitMessage}"`, {
          cwd: HISTORY_REPO_DIR,
          stdio: 'pipe'
        });
        
        execSync('git push origin main', {
          cwd: HISTORY_REPO_DIR,
          stdio: 'pipe'
        });
        
        console.log('   ✅ プッシュ完了');
      } catch (error) {
        console.error('   ❌ プッシュエラー:', error.message);
      }
    } else {
      console.log('\n⏭️  変更なし。プッシュはスキップします。');
    }
    
    // サマリー表示
    console.log('\n========================================');
    console.log('完了');
    console.log('========================================');
    console.log(`成功: ${results.success.length}/${numDays}日`);
    console.log(`  - 新規: ${results.new}件`);
    console.log(`  - 更新: ${results.updated}件`);
    console.log(`  - 変更なし: ${results.unchanged}件`);
    
    if (results.failed.length > 0) {
      console.log(`\n失敗: ${results.failed.length}件`);
      results.failed.forEach(({ dateLabel, error }) => {
        console.log(`  - ${dateLabel}: ${error}`);
      });
    }
    
    console.log('========================================\n');
    
    process.exit(results.failed.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error('❌ エラー:', error.message);
    console.error('\n詳細:', error.stack);
    process.exit(1);
  }
}

// スクリプト実行
if (require.main === module) {
  main();
}

module.exports = { main, scrapeAndSaveMenu };
