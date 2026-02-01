#!/usr/bin/env node
/**
 * 学習用データ同期スクリプト
 * 
 * 機能:
 * - kyowa-menu-history リポジトリから学習データを取得
 * - ローカルとの差分を確認
 * - 更新されたデータのみをローカルに保存
 * 
 * 実行方法:
 *   node sync-training-data.js
 * 
 * 前提条件:
 *   - kyowa-menu-history リポジトリへのアクセス権限（SSH key設定済み）
 *   - Git がインストール済み
 * 
 * 保存先:
 *   - 食事履歴: docs/ai-selections/
 *   - 可用日付リスト: docs/ai-selections/available-ai-dates.json
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// kyowa-menu-history リポジトリのパス（並列リポジトリ）
const HISTORY_REPO_DIR = path.join(__dirname, '..', 'kyowa-menu-history');

// 出力ディレクトリ
const OUTPUT_DIR = path.join(__dirname, 'docs', 'ai-selections');

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
  console.log('📦 kyowa-menu-history リポジトリを同期中...\n');
  
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
    console.log('   ✅ 最新状態に更新完了\n');
  } catch (error) {
    console.log('   ⚠️  プルに失敗:', error.message);
    console.log('   リポジトリはそのまま使用します\n');
  }
}

/**
 * ファイル内容を比較
 */
function hasContentChanged(localPath, remotePath) {
  if (!fs.existsSync(localPath)) {
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
 * メイン処理
 */
async function main() {
  console.log('========================================');
  console.log('学習用データ同期スクリプト');
  console.log('========================================\n');
  
  try {
    // Git リポジトリを同期
    syncGitRepo();
    
    // 出力ディレクトリを確保
    ensureDir(OUTPUT_DIR);
    
    // リポジトリから食事履歴ファイル一覧を取得
    const historyDir = path.join(HISTORY_REPO_DIR, 'data', 'history');
    
    if (!fs.existsSync(historyDir)) {
      console.log('⚠️  食事履歴ディレクトリが見つかりません');
      return;
    }
    
    const historyFiles = fs.readdirSync(historyDir)
      .filter(f => f.endsWith('.json'))
      .sort();
    
    if (historyFiles.length === 0) {
      console.log('⚠️  食事履歴がありません');
      return;
    }
    
    console.log(`見つかったファイル: ${historyFiles.length}件\n`);
    
    let newCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    
    // 各ファイルを比較してコピー
    for (const fileName of historyFiles) {
      const remotePath = path.join(historyDir, fileName);
      const localFileName = fileName.replace(/^(\d{4})-(\d{2})-(\d{2})\.json$/, 'ai-selections_$1-$2-$3.json');
      const localPath = path.join(OUTPUT_DIR, localFileName);
      
      const localExists = fs.existsSync(localPath);
      
      if (!localExists) {
        // 新規ファイル
        fs.copyFileSync(remotePath, localPath);
        console.log(`✅ ${fileName}: 新規作成`);
        newCount++;
      } else if (hasContentChanged(localPath, remotePath)) {
        // 更新されたファイル
        fs.copyFileSync(remotePath, localPath);
        console.log(`🔄 ${fileName}: 更新`);
        updatedCount++;
      } else {
        // 変更なし
        console.log(`⏭️  ${fileName}: 変更なし`);
        unchangedCount++;
      }
    }
    
    // 可用日付リストを生成
    console.log('\n📅 可用日付リストを生成中...');
    const availableDates = historyFiles
      .map(f => f.replace('.json', ''))
      .sort();
    
    const availableDatesPath = path.join(OUTPUT_DIR, 'available-ai-dates.json');
    fs.writeFileSync(
      availableDatesPath,
      JSON.stringify({ dates: availableDates }, null, 2),
      'utf-8'
    );
    console.log(`✅ 可用日付リスト: ${availableDates.length}件\n`);
    
    // サマリー表示
    console.log('========================================');
    console.log('同期完了');
    console.log('========================================');
    console.log(`新規作成: ${newCount}件`);
    console.log(`更新: ${updatedCount}件`);
    console.log(`変更なし: ${unchangedCount}件`);
    console.log(`合計: ${historyFiles.length}件`);
    console.log('========================================\n');
    
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

module.exports = { main };
