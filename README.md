# 🍽️ Kyowa Menu Scrape - GitHub Pages Edition

完全無料でホストされるメニュー最適化 Web アプリケーション。GitHub Actions で自動スクレイピング、GitHub Pages で 24/7 稼働。

## ✨ 特徴

- 📱 **iPhone/iPad 対応** - レスポンシブ UI
- 🤖 **自動スクレイピング** - GitHub Actions で毎週自動実行
- 🌐 **完全無料** - GitHub 無料プランで完結
- 💻 **サーバー不要** - フロントエンドのみで動作
- 🚀 **どこからでもアクセス** - GitHub Pages で公開

## 🏗️ システム構成

```
GitHub Actions（毎週日曜 21:00 実行）
  ↓
[prescrap.js] スクレイピング実行
  ↓
[docs/menus/] JSON ファイル生成
  ↓
GitHub に自動 push
  ↓
GitHub Pages で公開
  ↓
iPhone/PC でアクセス可能
```

## 📋 セットアップ手順

### 1. GitHub に登録

GitHub アカウントがなければ作成：https://github.com

### 2. このリポジトリを自分のアカウントにフォーク

またはクローンしてから `git push`

```bash
git clone https://github.com/onotakanori/kyowa-menu-scrape.git
cd kyowa-menu-scrape
git remote set-url origin https://github.com/YOUR_USERNAME/kyowa-menu-scrape.git
git push -u origin main
```

### 3. GitHub Pages を有効化

リポジトリの Settings → Pages → Source を以下に設定：
- **Source**: Deploy from a branch
- **Branch**: main
- **Folder**: / (root)

### 4. GitHub Actions を実行

リポジトリの Actions タブで "🔄 Weekly Menu Scrape" を実行

**初回実行：**
- Actions タブ → "🔄 Weekly Menu Scrape" → "Run workflow"

**スケジュール実行：**
- 毎週日曜日 21:00（JST）に自動実行

### 5. アプリにアクセス

GitHub Pages の URL：`https://YOUR_USERNAME.github.io/kyowa-menu-scrape/`

## 🔄 スケジュール設定

スクレイピングは毎週日曜日 21:00（JST）に自動実行されます。

手動実行の場合：
1. Actions タブを開く
2. "🔄 Weekly Menu Scrape" をクリック
3. "Run workflow" ボタンをクリック

## 📱 使用方法

1. **日付を選択** - ドロップダウンから希望日を選択
2. **メニューを確認** - スクレイピング済みメニューを表示
3. **栄養目標を設定** - チェックボックスで選択、目標値を入力
4. **メニューを選択**
   - ○ 通常：グリーンで選択
   - ＋ 固定：必ず含める
   - ✕ 除外：除外する
5. **最適化実行** - 「最適化実行」ボタンをクリック
6. **結果を確認** - 提案メニューと栄養情報を表示

## 📂 ディレクトリ構造

```
kyowa-menu-scrape/
├── .github/
│   └── workflows/
│       └── scrape.yml              # GitHub Actions 自動実行設定
├── docs/                           # GitHub Pages ホスティング
│   ├── index.html                  # Web UI
│   ├── app.js                      # フロントエンド（最適化を実行）
│   ├── style.css                   # スタイル
│   ├── menus/                      # 自動生成されるメニュー JSON
│   │   ├── menus_2026-01-13.json
│   │   └── ...
│   └── available-dates.json        # 自動生成される日付リスト
├── src/
│   ├── scraper/
│   │   └── fetchMenus.js           # Playwright スクレイピング
│   ├── utils/
│   │   └── date.js                 # 日付ユーティリティ
│   ├── optimizer/
│   │   └── optimizeMenus.js        # 最適化アルゴリズム
│   └── index.js                    # ローカル実行用サーバー（不要）
├── prescrap.js                     # GitHub Actions で実行するスクリプト
└── package.json
```

## 🚀 ローカル開発（オプション）

ローカルでテストする場合：

```bash
# 1. 依存パッケージをインストール
npm install

# 2. メニューをスクレイピング（初回）
node prescrap.js

# 3. ローカルサーバーを起動
npm start

# 4. ブラウザで開く
# http://localhost:3000
```

## 🔧 主要なファイル説明

### prescrap.js
- 複数日分のメニューをスクレイピング
- `docs/menus/` に JSON ファイルを出力
- `docs/available-dates.json` を生成
- GitHub Actions で実行

### docs/app.js
- **フロントエンドのみで動作**
- `docs/menus/` から JSON を読み込み
- JavaScript で最適化アルゴリズムを実行
- サーバー側 API 不要

### .github/workflows/scrape.yml
- GitHub Actions ワークフロー設定
- 毎週日曜日 21:00 に自動実行
- npm install → prescrap.js → git push

## 💡 機能詳細

### 栄養目標設定
以下の栄養項目から選択可能：
- エネルギー（kcal）
- たんぱく質（g）
- 脂質（g）
- 炭水化物（g）
- 食塩相当量（g）
- その他アレルゲン情報

### メニュー選択方法
- **○ 通常** - 最適化に含める
- **＋ 固定** - 必ず含める（確定）
- **✕ 除外** - 最適化から除外

### 最適化結果
- 提案メニュー（除外ボタン付き）
- 栄養情報テーブル
- レーダーチャート
- 距離スコア

## 📊 データ更新

メニューは毎週自動更新されます：

| イベント | タイミング | 実行内容 |
|---------|-----------|--------|
| 定期実行 | 毎週日曜 21:00 | スクレイピング → JSON 生成 |
| 手動実行 | GitHub Actions から | スクレイピング → JSON 生成 |

## 🔐 セキュリティ

- GitHub Actions のランナーは隔離された環境で実行
- 認証情報不要（公開サイト）
- Playwright は安全な環境で実行
- GitHub の規約に準拠

## 📝 トラブルシューティング

**Q. メニューが表示されない**
- A. 手動で GitHub Actions を実行してください
- Actions タブ → "🔄 Weekly Menu Scrape" → "Run workflow"

**Q. 日付がない**
- A. prescrap.js が実行されていません
- GitHub Actions のログを確認してください

**Q. サイトにアクセスできない**
- A. GitHub Pages が有効になっているか確認
- Settings → Pages → Source が正しく設定されているか確認

## 📞 サポート

問題が発生した場合：
1. GitHub Issues で報告
2. GitHub Actions のログを確認
3. `.github/workflows/scrape.yml` の設定を確認

## 📄 ライセンス

MIT License

## 🎯 今後の改善予定

- [ ] キャッシュの永続化（複数週分）
- [ ] 栄養情報フィルタリング
- [ ] PWA 対応
- [ ] 多言語対応

---

**2026年1月 - GitHub Pages Edition**
