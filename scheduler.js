#!/usr/bin/env node

/**
 * 自動スケジューラー：毎週 1 回スクレイピングを実行して GitHub に push
 * 
 * 用途:
 *   - 毎週月曜 05:00 JST にスクレイピング実行
 *   - menus/ ディレクトリに JSON ファイルを保存
 *   - 自動的に Git に コミット・プッシュ
 * 
 * 実行方法:
 *   node scheduler.js          # フォアグラウンド実行
 *   nohup node scheduler.js &  # バックグラウンド実行
 *   
 * PM2 での運用:
 *   npm install -g pm2
 *   pm2 start scheduler.js --name kyowa-scraper
 *   pm2 save
 *   pm2 startup
 */

const cron = require('node-cron');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');

const execAsync = promisify(exec);

/**
 * スクレイピングと Git push を実行
 */
async function runScrapingAndPush() {
  const timestamp = new Date().toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔥 スケジュール実行開始: ${timestamp}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    // ステップ 1: 現在のメニューファイルをバックアップ
    console.log('📦 現在のメニューファイルをバックアップ中...');
    const menusDir = path.join(__dirname, 'menus');
    const backupDir = path.join(__dirname, '.backup');
    
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    // ステップ 2: prescrap.js を実行（5日分取得）
    console.log('\n📥 スクレイピング実行中（5日分）...');
    const { stdout, stderr } = await execAsync('node prescrap.js 5', {
      cwd: __dirname,
      timeout: 5 * 60 * 1000  // 5分のタイムアウト
    });

    console.log(stdout);
    if (stderr) {
      console.warn('⚠️  警告:', stderr);
    }

    // ステップ 3: Git にコミット
    console.log('\n💾 変更を Git にコミット中...');
    
    // 変更があるか確認
    const { stdout: statusOutput } = await execAsync('git status --porcelain', {
      cwd: __dirname
    });

    if (statusOutput.trim().length === 0) {
      console.log('ℹ️  変更なし: メニュー情報は前回と同じです');
    } else {
      // Git に追加
      await execAsync('git add menus/ docs/', {
        cwd: __dirname
      });

      // コミット
      const commitMessage = `chore: Auto-scraped menu data - ${timestamp}`;
      await execAsync(`git commit -m "${commitMessage}"`, {
        cwd: __dirname
      });
      console.log('✅ Git にコミット完了');

      // ステップ 4: GitHub に push
      console.log('\n🚀 GitHub に push 中...');
      await execAsync('git push origin main', {
        cwd: __dirname,
        timeout: 2 * 60 * 1000  // 2分のタイムアウト
      });
      console.log('✅ GitHub に push 完了');
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log('✨ スケジュール実行完了');
    console.log(`${'='.repeat(70)}\n`);

  } catch (error) {
    console.error('\n❌ エラーが発生しました:', error.message);
    
    // エラーログを記録
    const logFile = path.join(__dirname, 'scheduler-error.log');
    const errorLog = `[${timestamp}] ${error.message}\n${error.stack}\n`;
    fs.appendFileSync(logFile, errorLog);
    console.error(`エラーログを保存: ${logFile}`);

    // 通知（オプション）
    if (process.env.SLACK_WEBHOOK_URL) {
      try {
        await notifySlack(`❌ スクレイピング失敗: ${error.message}`);
      } catch (slackError) {
        console.error('Slack 通知失敗:', slackError.message);
      }
    }

    process.exit(1);
  }
}

/**
 * Slack に通知（オプション）
 * 環境変数: SLACK_WEBHOOK_URL
 */
async function notifySlack(message) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  const https = require('https');
  const url = new URL(webhookUrl);

  const payload = JSON.stringify({
    text: message,
    username: 'Kyowa Menu Scraper',
    icon_emoji: ':utensils:'
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': payload.length
      }
    };

    const req = https.request(options, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Slack API error: ${res.statusCode}`));
      } else {
        resolve();
      }
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * スケジュール設定
 * 
 * Cron 式: "分 時 日 月 曜日"
 * 毎週月曜日 05:00 JST: "0 5 * * 1"
 */
function startScheduler() {
  // 毎週月曜 05:00 JST
  const task = cron.schedule('0 5 * * 1', () => {
    runScrapingAndPush();
  }, {
    timezone: 'Asia/Tokyo'
  });

  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  console.log(`\n${'='.repeat(70)}`);
  console.log('📅 スケジューラー起動');
  console.log(`${'='.repeat(70)}`);
  console.log(`現在時刻: ${now}`);
  console.log('⏰ 予定: 毎週月曜日 05:00 JST にスクレイピング実行');
  console.log(`${'='.repeat(70)}\n`);

  return task;
}

/**
 * 開発用：即座にスクレイピング実行
 */
async function runNow() {
  if (process.argv[2] === '--now') {
    console.log('💨 即座にスクレイピング実行...\n');
    await runScrapingAndPush();
    process.exit(0);
  }
}

// メイン処理
(async () => {
  try {
    await runNow();
    startScheduler();
  } catch (error) {
    console.error('❌ 初期化エラー:', error);
    process.exit(1);
  }
})();

// グレースフルシャットダウン
process.on('SIGINT', () => {
  console.log('\n\n👋 スケジューラーを停止します...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\n👋 スケジューラーを停止します...');
  process.exit(0);
});
