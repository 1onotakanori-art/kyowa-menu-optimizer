# データ同期・スクレイピングガイド

このドキュメントでは、学習用データの同期とメニュースクレイピングの実行方法を説明します。

## 概要

プロジェクトには2つの独立したデータ管理スクリプトがあります：

1. **学習用データ同期** (`sync-training-data.js`) - GitHub から食事履歴を取得
2. **メニュースクレイプ & アップロード** (`scrape-and-upload.js`) - メニューをスクレイピングして GitHub にアップロード

## 事前準備

### SSH キーの設定

両スクリプトとも Git 操作（clone/pull/push）を使用するため、SSH キーが必要です。

**SSH キーの確認:**
```bash
# SSH キーが存在するか確認
ls -la ~/.ssh/id_*.pub

# GitHub との接続テスト
ssh -T git@github.com
```

**SSH キーの生成（まだない場合）:**
```bash
# SSH キーを生成
ssh-keygen -t ed25519 -C "your_email@example.com"

# SSH エージェントに追加
eval "$(ssh-agent -s)"
ssh-add ~/.ssh/id_ed25519

# 公開鍵をクリップボードにコピー
pbcopy < ~/.ssh/id_ed25519.pub
```

**GitHub に公開鍵を登録:**
1. GitHub にログイン
2. Settings → SSH and GPG keys → New SSH key
3. クリップボードの内容を貼り付けて保存
4. 接続テスト: `ssh -T git@github.com`

## 1. 学習用データ同期

管理者ページで記録した食事データを GitHub から取得し、ローカルに同期します。

### 実行方法

```bash
# 基本実行
npm run sync

# または直接実行
node sync-training-data.js
```

### 動作

1. `kyowa-menu-history` リポジトリを clone/pull
2. リポジトリの `data/history/` から食事履歴を取得
3. ローカルの `docs/ai-selections/` と比較
4. 新規データまたは更新されたデータのみをコピー
5. `docs/ai-selections/available-ai-dates.json` を生成

### 出力例

```
========================================
学習用データ同期スクリプト
========================================

📦 kyowa-menu-history リポジトリを同期中...

   既存リポジトリを更新中...
   ✅ プル完了

見つかったファイル: 15件

✅ 2026-01-13.json: 新規作成
✅ 2026-01-14.json: 新規作成
🔄 2026-01-15.json: 更新
⏭️  2026-01-16.json: 変更なし
...

📅 可用日付リストを生成中...
✅ 可用日付リスト: 15件

========================================
同期完了
========================================
新規作成: 5件
更新: 2件
変更なし: 8件
合計: 15件
========================================
```

### 定期実行の推奨

**毎日実行する場合:**
```bash
# crontab に追加（毎日午前9時）
0 9 * * * cd /path/to/kyowa-menu-optimizer && /usr/local/bin/node sync-training-data.js >> logs/sync.log 2>&1
```

## 2. メニュースクレイプ & アップロード

Kyowa のメニューサイトからメニューをスクレイピングし、GitHub にアップロードします。

### 実行方法

```bash
# デフォルト（5日分）
npm run scrape

# 10日分
npm run scrape:10

# 20日分
npm run scrape:20

# カスタム日数
node scrape-and-upload.js 15
```

### 動作

1. `kyowa-menu-history` リポジトリを clone/pull
2. 指定日数分のメニューをスクレイピング（平日のみ）
3. ローカルの `menus/` に保存
4. リポジトリの `data/menus/` と比較
5. 新規または更新されたデータをリポジトリにコピー
6. `available-dates.json` を更新
7. Git commit & push で GitHub にアップロード

### 出力例

```
========================================
メニュースクレイプ & アップロード
========================================
対象日数: 5日

📦 kyowa-menu-history リポジトリを同期中...
   ✅ 同期完了

[1/5] 2/1(月)
📅 スクレイピング中: 2/1(月)
   ✅ メニュー数: 42
   📤 リポジトリにコピー: 2026-02-01.json (新規)

[2/5] 2/2(火)
📅 スクレイピング中: 2/2(火)
   ✅ メニュー数: 38
   ⏭️  2026-02-02.json (変更なし)

...

📅 available-dates.json を更新中...
   ✅ リポジトリにコピー完了

🚀 変更を GitHub にプッシュ中...
   ✅ プッシュ完了

========================================
完了
========================================
成功: 5/5日
  - 新規: 2件
  - 更新: 1件
  - 変更なし: 2件
========================================
```

### 定期実行の推奨

**毎週月曜日に実行する場合:**
```bash
# crontab に追加（毎週月曜 午前8時に10日分スクレイプ）
0 8 * * 1 cd /path/to/kyowa-menu-optimizer && /usr/local/bin/node scrape-and-upload.js 10 >> logs/scrape.log 2>&1
```

## トラブルシューティング

### エラー: "リポジトリのクローンに失敗しました"

SSH キーが正しく設定されていない可能性があります。

```bash
# SSH 接続をテスト
ssh -T git@github.com

# 成功すれば以下のようなメッセージが表示されます:
# Hi username! You've successfully authenticated...
```

SSH キーが設定されていない場合は、「事前準備」セクションを参照してください。

### エラー: "git pull に失敗しました"

リポジトリが破損している可能性があります。`.tmp/kyowa-menu-history` を削除して再実行してください。

```bash
rm -rf .tmp/kyowa-menu-history
node sync-training-data.js
```

### エラー: スクレイピングが失敗する

- ネットワーク接続を確認
- Kyowa のメニューサイトが利用可能か確認
- Playwright のブラウザがインストールされているか確認:
  ```bash
  npx playwright install chromium
  ```

### Git push が遅い

ネットワーク接続を確認してください。大量のデータを扱う場合は、実行間隔を調整してください。

## ファイル構成

```
/Users/onotakanori/Apps/
├── kyowa-menu-optimizer/          # メインプロジェクト
│   ├── sync-training-data.js      # 学習データ同期スクリプト
│   ├── scrape-and-upload.js       # スクレイプ&アップロードスクリプト
│   ├── lib/
│   │   └── github-utils.js        # GitHub API ユーティリティ
│   ├── menus/                     # スクレイプしたメニューデータ
│   │   ├── menus_2026-01-13.json
│   │   └── available-dates.json
│   └── docs/
│       └── ai-selections/         # 学習用食事履歴データ
│           ├── ai-selections_2026-01-13.json
│           └── available-ai-dates.json
└── kyowa-menu-history/            # データリポジトリ（並列）
    └── data/
        ├── history/               # 食事履歴
        │   ├── 2026-01-13.json
        │   └── ...
        └── menus/                 # メニューデータ
            ├── 2026-01-13.json
            └── available-dates.json
```

## 注意事項

- **リポジトリ構成**: `kyowa-menu-optimizer` と `kyowa-menu-history` は並列で配置されている必要があります
  - `/Users/onotakanori/Apps/kyowa-menu-optimizer`
  - `/Users/onotakanori/Apps/kyowa-menu-history`
- **スクレイピング頻度**: サーバー負荷を考慮して、スクレイピング間隔は最低1秒空けています
- **プライベートリポジトリ**: `kyowa-menu-history` はプライベートリポジトリです。SSH キーが必要です
- **データ形式**: JSON 形式で保存され、正規化された状態で比較されます
- **エラーハンドリング**: 一部のデータ取得に失敗しても、他のデータは処理を継続します

## 関連ドキュメント

- [管理者ページセットアップ](docs/ADMIN_SETUP.md)
- [GitHub Token セットアップ](docs/GITHUB_TOKEN_SETUP.md)
- [スクレイパー再構築プラン](SCRAPER_REBUILD_PLAN.md)
