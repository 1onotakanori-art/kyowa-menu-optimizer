# 自動スケジューラー セットアップガイド

## 概要

`scheduler.js` は Kyowa カフェテリアのメニューを **毎週月曜日 05:00 JST に自動スクレイピング** し、その結果を GitHub に自動送信します。

- **実行周期**: 毎週月曜日 05:00 JST
- **スクレイピング範囲**: 5日分（最初の平日から）
- **自動コミット・プッシュ**: 変更があれば GitHub に送信

---

## 実行方法

### 1️⃣  フォアグラウンド実行（テスト用）

```bash
node scheduler.js
```

**出力例**:
```
======================================================================
📅 スケジューラー起動
======================================================================
現在時刻: 2026年1月17日 14:30:45
⏰ 予定: 毎週月曜日 05:00 JST にスクレイピング実行
======================================================================
```

このまま放置しておくと、スケジュール時刻に自動実行されます。

---

### 2️⃣  バックグラウンド実行（本番推奨）

```bash
nohup node scheduler.js > scheduler.log 2>&1 &
```

**ステータス確認**:
```bash
ps aux | grep scheduler
tail -f scheduler.log
```

**停止**:
```bash
pkill -f "node scheduler.js"
```

---

### 3️⃣  PM2 による永続化（推奨）

[PM2](https://pm2.keymetrics.io/) を使用すれば、マシン再起動後も自動実行が継続されます。

```bash
# PM2 をグローバルインストール
npm install -g pm2

# Kyowa スクレイパーを PM2 で起動
pm2 start scheduler.js --name kyowa-scraper

# スケジュール実行時の再起動時に自動起動
pm2 startup
pm2 save

# ステータス確認
pm2 list
pm2 logs kyowa-scraper
```

**よく使うコマンド**:
```bash
pm2 logs kyowa-scraper         # ログをリアルタイム表示
pm2 restart kyowa-scraper      # 再起動
pm2 stop kyowa-scraper         # 停止
pm2 delete kyowa-scraper       # 削除
pm2 startup                    # システム起動時に自動実行設定
```

---

### 4️⃣  即座に実行（テスト用）

スケジュール時刻を待たずに今すぐ実行する場合：

```bash
node scheduler.js --now
```

---

## 設定のカスタマイズ

### スケジュール変更

[scheduler.js](scheduler.js) の **31行目** を編集：

```javascript
// 毎週月曜 05:00 JST
const task = cron.schedule('0 5 * * 1', () => {
```

**Cron 式 リファレンス**:
```
"分 時 日 月 曜日"
 0  5  *  *  1        # 毎週月曜 05:00 JST
 0  0  *  *  *        # 毎日 00:00 JST
 0  */6 *  *  *       # 6時間ごと
 30 2  *  *  0        # 毎週日曜 02:30 JST
```

### スクレイピング日数変更

[scheduler.js](scheduler.js) の **59行目** を編集：

```javascript
const { stdout, stderr } = await execAsync('node prescrap.js 5', {  // ← ここの数字を変更
```

### Slack 通知（オプション）

エラー時に Slack へ通知可能。環境変数を設定してください：

```bash
export SLACK_WEBHOOK_URL="https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
node scheduler.js
```

---

## 動作フロー

```
1️⃣  スケジュール時刻到達
     ↓
2️⃣  prescrap.js を実行（5日分スクレイピング）
     ↓
3️⃣  menus/ ディレクトリに JSON 保存
     ↓
4️⃣  git add / git commit
     ↓
5️⃣  git push origin main
     ↓
✅ 完了！GitHub に最新メニューが追加
```

---

## ログ・エラーハンドリング

### 正常実行時
```
================================================== ========
🔥 スケジュール実行開始: 2026年1月20日 05:00:00
==================================================================
📦 現在のメニューファイルをバックアップ中...
📥 スクレイピング実行中（5日分）...
✅ Git にコミット完了
✅ GitHub に push 完了
=================================================================== 
✨ スケジュール実行完了
====================================================================
```

### エラー時

- エラー内容が `scheduler-error.log` に記録されます
- Slack 通知が設定されていれば、Slack にもエラー通知が送信されます

**エラーログ確認**:
```bash
cat scheduler-error.log
tail -f scheduler-error.log
```

---

## Git 設定確認

スケジューラーが GitHub に push するには、Git の認証設定が必要です。

### SSH キーが設定されている場合
```bash
git remote set-url origin git@github.com:YOUR_USER/YOUR_REPO.git
```

### HTTPS + Personal Access Token (GitHub)
```bash
git remote set-url origin https://YOUR_USER:YOUR_TOKEN@github.com/YOUR_USER/YOUR_REPO.git
```

**確認**:
```bash
git remote -v
# origin  git@github.com:... (SSH の場合)
```

---

## トラブルシューティング

### Q: スケジュール時刻に実行されない

**原因**: Playwright のブラウザダウンロードが必要
```bash
# Chromium をダウンロード
npx playwright install chromium
```

### Q: Git push が失敗する

**確認事項**:
- GitHub の認証設定（SSH キーまたはトークン）
- リモート URL：`git remote -v`
- ブランチ名：デフォルトブランチは `main`

```bash
# 手動テスト
git push origin main
```

### Q: バックグラウンドプロセスを確認したい

```bash
ps aux | grep "node scheduler"
```

### Q: ログを常に見たい場合

```bash
# PM2 使用時
pm2 logs kyowa-scraper --lines 100

# nohup 使用時
tail -f scheduler.log
```

---

## セキュリティ注意事項

1. **Git 認証情報**: 環境変数やファイルに平文で保存しないでください
2. **Slack Webhook**: `.env` ファイルや `.gitignore` に含める
3. **ログファイル**: 機密情報を含む場合は `.gitignore` に追加

```bash
echo "scheduler-error.log" >> .gitignore
```

---

## 次のステップ

- ✅ scheduler.js を起動して稼働確認
- ✅ 最初のスケジュール実行を待つか、`--now` で即座実行
- ✅ `menus/` に JSON ファイルが生成されることを確認
- ✅ GitHub リポジトリにコミットが表示される確認

---

## サポート

問題が発生した場合：
1. `scheduler-error.log` を確認
2. `node scheduler.js --now` でテスト実行
3. `git status` で変更状態確認
4. `git log` でコミット履歴確認
