# 🍽️ Kyowa Menu Optimizer

協和食堂のメニューから栄養目標に最適なメニュー組み合わせを自動提案するWebアプリケーション。

[![GitHub Pages](https://img.shields.io/badge/GitHub-Pages-blue)](https://1onotakanori-art.github.io/kyowa-menu-optimizer/)

## ✨ 特徴

- 📱 **iPhone/iPad 完全対応** - タップ操作でメニュー選択
- 🎯 **栄養目標最適化** - E/P/F/C/V の5つの栄養素を同時に最適化
- 🎨 **直感的なUI** - 色で状態を判別（推奨/固定/除外）
- 📊 **レーダーチャート** - 目標vs実績を視覚的に表示
- 🌐 **完全無料** - GitHub Pages でホスト
- 💻 **サーバー不要** - 静的サイトのみで動作

## 🏗️ システム構成

```
ローカル（Mac）でスクレイピング
  ↓
[prescrap.js] Playwright でメニュー取得
  ↓
[menus/] JSON ファイル生成
  ↓
Git push → GitHub
  ↓
GitHub Pages で自動デプロイ（1-2分）
  ↓
https://1onotakanori-art.github.io/kyowa-menu-optimizer/
```

## 📋 セットアップ手順

### 1. リポジトリのクローン

```bash
git clone https://github.com/1onotakanori-art/kyowa-menu-optimizer.git
cd kyowa-menu-optimizer
```

### 2. 依存関係のインストール

```bash
npm install
```

### 3. スクレイピング実行（ローカル）

```bash
node prescrap.js
```

スクレイピングされたメニューは `menus/` ディレクトリに保存されます。

### 4. GitHub Pages の設定

リポジトリの Settings → Pages → Source を以下に設定：
- **Source**: Deploy from a branch
- **Branch**: main
- **Folder**: / (root)

### 5. デプロイ

```bash
git add -A
git commit -m "メニューデータ更新"
git push origin main
```


## 📱 使用方法

1. **日付を選択** - ドロップダウンから希望日を選択
2. **栄養目標を設定** - E/P/F/C/V の目標値を入力
3. **最大メニュー数** - 1回で選べる上限数を設定（1-100）
4. **メニューを選択**
   - 📗 推奨（緑）：最適化が推奨するメニュー
   - 📘 固定（青）：必ず含める（タップで設定）
   - 📕 除外（赤）：除外する（タップ2回で設定）
5. **最適化実行** - ボタンをクリック
6. **結果を確認** - 提案メニューと栄養チャートを表示

## 📂 ディレクトリ構造

```
kyowa-menu-optimizer/
├── index.html                      # Web UI
├── app.js                          # フロントエンド（最適化実行）
├── style.css                       # スタイル
├── menus/                          # スクレイピング済みメニュー JSON
│   ├── menus_2026-01-13.json
│   └── ...
├── src/
│   ├── scraper/
│   │   └── fetchMenus.js           # Playwright スクレイピング
│   ├── utils/
│   │   └── date.js                 # 日付ユーティリティ
│   └── optimizer/
│       └── optimizeMenus.js        # 最適化アルゴリズム
├── prescrap.js                     # スクレイピングメインスクリプト
└── package.json
```

## 🔧 スクレイピング詳細

### 実行タイミング

- **手動実行**: `node prescrap.js`（Mac/Linux/WSLのみ）
- **頻度**: 週1回程度を推奨（メニューは週次更新）

### スクレイピング対象

- **対象サイト**: https://kyowa2407225.uguide.info
- **取得日数**: 5日分（デフォルト）
- **取得項目**:
  - メニュー名
  - 栄養成分（エネルギー/たんぱく質/脂質/炭水化物/ビタミン群）

### トラブルシューティング

**エラー: 日付が見つかりません**
- サイトが未更新の可能性があります
- 翌営業日以降に再実行してください

**メニュー数が少ない**
- サイトの読み込み遅延による可能性があります
- `src/scraper/fetchMenus.js` の `waitForTimeout` を調整してください

**Playwright エラー**
- Chromium のインストール: `npx playwright install chromium`

## 📊 最適化アルゴリズム

- **手法**: 0-1ナップサック問題の動的計画法
- **制約条件**:
  - 最大メニュー数
  - 固定メニューは必須
  - 除外メニューは不可
- **目標**: 栄養目標との差の最小化

## 🌐 GitHub Pages URL

https://1onotakanori-art.github.io/kyowa-menu-optimizer/

## 📜 ライセンス

MIT License

## 👤 作成者

- GitHub: [@1onotakanori-art](https://github.com/1onotakanori-art)

---

**Note**: このプロジェクトは個人利用目的で作成されました。スクレイピング対象サイトの利用規約を遵守してください。

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
