# ✅ GitHub Actions + Pages 改造完了

## 🎉 完了内容のまとめ

### 実装したシステム

```
完全無料の自動運用 Web アプリ
    ↓
GitHub Actions（毎週自動実行）
    ↓
Playwright スクレイピング
    ↓
JSON ファイル生成（docs/menus/）
    ↓
GitHub に自動 push
    ↓
GitHub Pages で 24/7 公開
    ↓
iPhone からアクセス可能 ✅
```

---

## 📋 実装した内容

### 1️⃣ GitHub Actions ワークフロー
- **ファイル**: `.github/workflows/scrape.yml`
- **実行**:毎週日曜日 21:00（JST）自動実行
- **機能**: npm install → prescrap.js → git push

### 2️⃣ データ出力先の変更
- **旧**: `src/.menus-cache/`（ローカルのみ）
- **新**: `docs/menus/`（GitHub Pages で公開）
- **追加**: `docs/available-dates.json`（日付リスト）

### 3️⃣ フロントエンド の修正
- **app.js**: API 呼び出し → JSON ファイル直接読込
- **最適化実行**: サーバー側 → フロントエンド側に移行
- **結果**: サーバー不要、静的ファイルのみ

### 4️⃣ prescrap.js の修正
- **出力先**: `docs/menus/` に変更
- **追加機能**: `available-dates.json` 自動生成
- **バックアップ**: `src/.menus-cache/` も保持

### 5️⃣ ドキュメント
- **README.md**: 使用方法・セットアップガイド
- **GITHUB_SETUP.md**: GitHub へのデプロイ手順（このファイル）

---

## 🚀 これからのステップ

### 【必須】GitHub へのセットアップ

```bash
# 1. GitHub アカウント作成（まだの場合）
# https://github.com

# 2. GitHub 上に新しいリポジトリを作成
# リポジトリ名: kyowa-menu-scrape
# Public に設定

# 3. ローカルから push
cd /Users/onotakanori/kyowa-menu-scrape

git init
git remote add origin https://github.com/YOUR_USERNAME/kyowa-menu-scrape.git
git add .
git commit -m "GitHub Pages edition"
git branch -M main
git push -u origin main

# 4. GitHub Pages を有効化
# Settings → Pages
# Branch: main, Folder: /docs

# 5. GitHub Actions を手動実行
# Actions → "🔄 Weekly Menu Scrape" → "Run workflow"

# 6. 完成！
# https://YOUR_USERNAME.github.io/kyowa-menu-scrape/
```

---

## 📊 システム比較

### 旧システム（自宅 PC サーバー）
```
❌ 自宅 PC を常時オンにする必要あり
❌ 電気代がかかる
❌ 外出先からアクセス不可
❌ 同じ Wi-Fi 内のみ
```

### 新システム（GitHub Pages）
```
✅ 自宅 PC をオフにできる
✅ 電気代 0 円
✅ どこからでもアクセス可能
✅ インターネットあれば OK
✅ 月額 0 円で 24/7 稼働
```

---

## 📱 iPhone でのアクセス

### 方法 1: ブラウザで直接アクセス

```
Safari を開く
→ アドレスバーに以下を入力
→ https://YOUR_USERNAME.github.io/kyowa-menu-scrape/
→ ホームスクリーン に追加（オプション）
```

### 方法 2: ホームスクリーン に追加

1. Safari で上記 URL を開く
2. 共有 ボタン をクリック
3. "ホームスクリーン に追加" をタップ
4. ホーム画面からワンタップでアクセス可能

---

## 🔄 定期更新について

### 自動更新：毎週日曜日 21:00（JST）

- GitHub Actions が自動的に実行
- 最新のメニューをスクレイピング
- JSON ファイルを生成・更新
- 自動的に GitHub に push

### 手動実行：必要に応じて

```
GitHub リポジトリ
→ Actions タブ
→ "🔄 Weekly Menu Scrape"
→ "Run workflow" ボタン
→ 数分でスクレイピング完了
```

---

## ✨ 機能確認リスト

ローカルでテスト（`localhost:8080`）

- [ ] 日付ドロップダウンが表示されている
- [ ] メニューが読み込まれている
- [ ] 栄養情報が表示されている
- [ ] メニュー選択ボタン（○/＋/✕）が動作
- [ ] 最適化実行で結果が表示される
- [ ] レーダーチャートが表示される

GitHub Pages でテスト（`https://YOUR_USERNAME.github.io/...`）

- [ ] 上記と同じ動作が確認できる
- [ ] 複数回アクセスして正常に動作する
- [ ] iPhone Safari で動作確認

---

## 📂 ディレクトリ構成（最終）

```
kyowa-menu-scrape/
├── .github/
│   └── workflows/
│       └── scrape.yml                    ← GitHub Actions 設定
├── docs/                                 ← GitHub Pages ホスティング
│   ├── index.html                        ← Web UI
│   ├── app.js                            ← フロントエンド最適化
│   ├── style.css                         ← スタイル
│   ├── menus/                            ← メニュー JSON（自動生成）
│   │   ├── menus_2026-01-13.json
│   │   ├── menus_2026-01-14.json
│   │   └── ...
│   └── available-dates.json              ← 日付リスト（自動生成）
├── src/                                  ← スクレイピング用
│   ├── scraper/
│   │   └── fetchMenus.js
│   ├── optimizer/
│   │   └── optimizeMenus.js
│   ├── utils/
│   │   └── date.js
│   └── index.js                          ← ローカルサーバー（不要）
├── prescrap.js                           ← GitHub Actions で実行
├── package.json
├── .gitignore
├── README.md                             ← ユーザー向けドキュメント
└── GITHUB_SETUP.md                       ← このファイル
```

---

## 🎯 推奨される実行順序

```
1. このドキュメント（GITHUB_SETUP.md）を読む ← 今ここ

2. ローカルで動作確認
   npm install
   node prescrap.js
   npx http-server docs -p 8080
   → http://localhost:8080 でアクセス

3. GitHub アカウント作成
   https://github.com

4. GitHub にリポジトリを作成

5. ローカルから GitHub に push
   git add .
   git commit -m "GitHub Pages edition"
   git push origin main

6. GitHub Pages を有効化
   Settings → Pages

7. GitHub Actions を実行
   Actions → Run workflow

8. アプリにアクセス
   https://YOUR_USERNAME.github.io/kyowa-menu-scrape/

9. iPhone でアクセス ✅ 完成！
```

---

## 🆘 よくある問題と解決方法

| 問題 | 原因 | 解決方法 |
|-----|-----|--------|
| GitHub Pages が表示されない | Pages が有効になっていない | Settings → Pages で確認 |
| メニューが表示されない | prescrap.js が実行されていない | Actions で手動実行 |
| Actions が失敗する | ネットワーク問題 | ログを確認して再実行 |
| 古いメニューが残っている | キャッシュが残っている | `rm -rf docs/menus/*` で削除 |
| iPhone で見ると UI が崩れる | レスポンシブ対応不足 | CSS を確認・修正 |

---

## 📞 サポートが必要な場合

GitHub Issues で以下を報告：

1. エラーメッセージ（スクリーンショット）
2. Actions のログ出力
3. 実行環境（OS、ブラウザなど）
4. 期待する動作と実際の動作

---

## 🎉 完成後の運用

### メンテナンス
- **毎週日曜日** - 自動でメニュー更新
- **手動更新** - 必要に応じて GitHub Actions で実行
- **バージョンアップ** - GitHub で push して自動反映

### 共有
```
https://YOUR_USERNAME.github.io/kyowa-menu-scrape/
↓
友人・家族に URL をシェア可能
↓
誰でも iPhone で使用可能
```

### 拡張
- PWA 対応（オフライン対応）
- 栄養情報フィルタリング
- 複数の献立パターン保存
- etc.

---

## 最後に

**このシステムの最大のメリット：**

✨ **完全に無料で、自動化された、24/7 稼働するシステムが実現します**

- GitHub は無料で無制限
- GitHub Actions も月 2000 分無料（十分）
- サーバー代 ¥0
- 電気代 ¥0
- 自宅 PC オフで OK

**さあ、デプロイしましょう！🚀**

---

作成日: 2026年1月12日
最終更新: GitHub Pages Edition
