# Kyowa Menu Optimizer - プロジェクト現状報告

**最終更新**: 2026年1月15日  
**プロジェクト概要**: 協和食堂のメニューを最適化するWebアプリケーション

---

## 📋 現在のシステム構成

### アーキテクチャ
- **フロントエンド**: 静的HTML/CSS/JavaScript（バニラJS、フレームワークなし）
- **スクレイパー**: Playwright + Node.js（ローカル実行）
- **デプロイ**: GitHub Pages（静的サイト）
- **データフロー**: ローカルスクレイプ → JSONファイル → GitHub → GitHub Pages

### ディレクトリ構造（簡易版）

```
kyowa-menu-optimizer/
├── index.html              # メインHTML（GitHub Pages用）
├── app.js                  # メインJavaScript
├── style.css               # メインCSS
├── menus/                  # メニューデータ（GitHub Pages配信用）
│   └── menus_YYYY-MM-DD.json
├── src/
│   ├── scraper/
│   │   └── fetchMenus.js   # スクレイピングロジック
│   └── utils/
│       └── date.js         # 日付ユーティリティ
├── prescrap.js             # スクレイピング実行スクリプト
└── docs/                   # 【廃止予定】旧GitHub Pages用

【現在不使用/重複】
├── docs/                   # 旧GitHub Pages用（廃止）
├── src/index.js            # 旧Express API（廃止）
├── src/server.js           # 旧サーバー（廃止）
├── src/public/             # 旧パブリックディレクトリ（廃止）
├── src/.menus-cache/       # 重複キャッシュ（廃止）
├── scrape.js               # 旧スクレイパー（廃止）
├── scrape_bk.js            # バックアップ（廃止）
└── available-dates.json    # 重複（docs/にもある）
```

---

## 🔄 方針変更の経緯

### 旧アーキテクチャ（廃止）
- **デプロイ**: GitHub Actions でスクレイプ → GitHub Pages
- **問題点**: 
  - GitHub Actions の実行時間制限
  - Playwright の不安定性
  - デバッグの困難さ

### 新アーキテクチャ（現在）
- **デプロイ**: ローカル（Mac）でスクレイプ → GitHub にプッシュ → GitHub Pages
- **メリット**:
  - スクレイプの安定性向上
  - デバッグが容易
  - 実行時間制限なし

---

## 📁 ファイル分類

### ✅ 必要なファイル（現在使用中）

#### メインアプリケーション
- `index.html` - メインHTML
- `app.js` - メインJavaScript（UI + 最適化ロジック）
- `style.css` - メインCSS

#### スクレイパー
- `prescrap.js` - スクレイピング実行スクリプト
- `src/scraper/fetchMenus.js` - スクレイピングロジック
- `src/utils/date.js` - 日付ユーティリティ

#### データ
- `menus/` - メニューJSONファイル（GitHub Pages配信用）
- `package.json` - 依存関係

#### ドキュメント
- `README.md` - プロジェクト説明
- `UI_IMPROVEMENTS.md` - UI改善履歴
- `PROJECT_STATUS.md` - 本ファイル

### ⚠️ 廃止予定ファイル（削除可能）

#### 旧GitHub Pages用
- `docs/` - 旧GitHub Pagesディレクトリ（全体）
  - `docs/index.html`
  - `docs/app.js`
  - `docs/style.css`
  - `docs/menus/` - メニューデータ（重複）
  - `docs/available-dates.json`

#### 旧サーバー/API
- `src/index.js` - 旧Express API
- `src/server.js` - 旧サーバー
- `src/public/` - 旧パブリックディレクトリ
  - `src/public/index.html`
  - `src/public/app.js`
  - `src/public/style.css`
- `src/optimizer/optimizeMenus.js` - 使用されていない（app.js に統合済み）

#### 旧スクレイパー
- `scrape.js` - 旧スクレイパー
- `scrape_bk.js` - バックアップ

#### 重複/不要
- `src/.menus-cache/` - 重複キャッシュ
- `available-dates.json` - ルートの重複ファイル
- `scrape_test.log` - テストログ

#### 旧ドキュメント
- `DEPLOYMENT_COMPLETE.md` - 旧デプロイ完了報告
- `GITHUB_SETUP.md` - 旧GitHub設定
- `MAINTENANCE.md` - 旧メンテナンスガイド

---

## 🐛 現在の問題

### スクレイパーの問題

#### 1. 日付選択エラー
**症状**: 
```
📅 日付選択: 「1/15(木)」
❌ エラー: 日付「1/15(木)」が見つかりません。利用可能な日付: 1/16(金), 1/19(月)...
```

**原因推定**:
- サイトが今日（1/15）のメニューを表示していない可能性
- 日付ボタンのDOM構造が変わった
- タイムゾーン問題（JST vs UTC）
- スクロール範囲外でボタンが見つからない

**対応策**:
- サイトの実際のDOM構造を確認
- 日付選択後の待機時間を延長
- `getNearestWeekday()` の開始日を翌日に変更

#### 2. 展開ボタンのクリック失敗
**症状**:
```
✅ クリック 1: 10 → 20 メニュー (+10)
⚠️  クリック 2: メニュー数変化なし (20 → 20) [タイムアウト]
```

**原因推定**:
- 展開ボタンが実際には存在しない（disabled状態）
- クリック後のDOM更新が3秒以上かかる
- 展開ボタンのセレクタが間違っている
- サイト側の仕様（20メニューが上限）

**対応策**:
- ボタンの存在確認を詳細化
- タイムアウトを延長
- サイトのHTML構造を再確認

---

## 🎯 次のアクション

### 優先度: 高
1. **不要ファイルの削除**
   - `docs/` ディレクトリ全体
   - `src/index.js`, `src/server.js`, `src/public/`
   - `scrape.js`, `scrape_bk.js`
   - `src/.menus-cache/`

2. **スクレイパーの修正**
   - 日付選択エラーの原因調査
   - 展開ボタンのロジック改善

3. **README.md の更新**
   - 現在のアーキテクチャを反映
   - セットアップ手順の更新

### 優先度: 中
4. **ドキュメント整理**
   - 不要なMDファイルの削除
   - 統合ドキュメントの作成

---

## 📝 技術スタック

### フロントエンド
- HTML5
- CSS3（Grid, Flexbox）
- JavaScript（ES6+、バニラJS）
- Chart.js（レーダーチャート）

### スクレイパー
- Node.js v18+
- Playwright v1.57.0
- Chromium（ヘッドレス）

### デプロイ
- GitHub Pages
- Git（バージョン管理）

---

## 🔗 重要なURL

- **本番サイト**: https://1onotakanori-art.github.io/kyowa-menu-optimizer/
- **スクレイプ対象**: https://kyowa2407225.uguide.info
- **リポジトリ**: https://github.com/1onotakanori-art/kyowa-menu-optimizer

---

## 💡 Copilot向けコンテキスト

### プロジェクトの目的
協和食堂のメニューから、ユーザーが設定した栄養目標（エネルギー、たんぱく質、脂質、炭水化物、野菜重量）に最も近いメニューの組み合わせを自動提案する。

### ユーザーワークフロー
1. 日付を選択
2. 栄養目標を入力（E, P, F, C, V）
3. メニュー一覧から固定/除外を選択（タップで状態切替）
4. 最適化実行
5. 結果表示（固定メニュー + 提案メニュー）

### 技術的特徴
- **最適化アルゴリズム**: 貪欲法（greedy）でメニューを選択
- **状態管理**: Set操作（fixedMenus, excludedMenus）
- **UI**: 3状態サイクル（推奨→固定→除外→推奨）
- **色**: 栄養成分ごとに色分け（E=灰、P=赤、F=黄、C=青、V=緑）

### データ構造
```json
{
  "dateLabel": "1/16(金)",
  "count": 20,
  "menus": [
    {
      "name": "メニュー名",
      "nutrition": {
        "エネルギー": 500,
        "たんぱく質": 20.5,
        "脂質": 15.3,
        "炭水化物": 60.2,
        "野菜重量": 120,
        "価格": 450
      }
    }
  ]
}
```

---

## 📚 関連ドキュメント

- `UI_IMPROVEMENTS.md` - UI改善履歴（28項目の修正記録）
- `.github/copilot-instructions.md` - Copilot用プロジェクト説明

---

**このドキュメントを見れば、Copilotはプロジェクトの全体像を把握できます。**
