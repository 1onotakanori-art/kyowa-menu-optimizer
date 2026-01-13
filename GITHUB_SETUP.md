# 🚀 GitHub Pages デプロイ完了ガイド

## 📚 このドキュメントについて

このアプリは **GitHub Pages + JavaScript** で完全に動作します。自宅の PC を常時起動する必要はありません！

---

## ✅ セットアップ完了内容

すでに以下が完了しています：

| 項目 | 内容 |
|-----|-----|
| **GitHub リポジトリ** | ✅ 作成済み |
| **GitHub Pages** | ✅ 公開中 |
| **フロントエンド** | ✅ JavaScript + HTML/CSS で動作 |
| **メニューデータ** | ✅ 8 日分が GitHub に保存済み |
| **自動更新** | ❌ 手動更新（ローカル実行 + Git push） |

---

## 🌐 アクセス方法

### iPhone での利用（推奨）

**1. Safari を開く**

**2. アドレスバーに入力**
```
https://1onotakanori-art.github.io/kyowa-menu-optimizer/
```

**3. エンター キーを押す**

**4. ホーム画面に追加**（アプリのように使用可能）
- 下部の共有ボタン（↑） → 「ホーム画面に追加」

### Mac での利用

```bash
# ローカルサーバー起動（オプション）
cd /Users/onotakanori/kyowa-menu-optimizer/docs
python3 -m http.server 8000

# ブラウザで以下にアクセス
# http://localhost:8000
```

---

## 📅 メニュー更新方法

メニューは **自動更新されません**。週 1 回、ローカルでメニューを取得して GitHub に保存します。

### 手順（5 分で完了）

**1. ターミナルを開く**
```bash
cd /Users/onotakanori/kyowa-menu-optimizer
```

**2. メニューをスクレイピング**
```bash
node prescrap.js
```

**3. GitHub に保存**
```bash
git add docs/menus/ docs/available-dates.json
git commit -m "Update: Weekly menus for $(date '+%Y-%m-%d')"
git push origin main
```

### ✅ 成功確認
- ターミナルに「成功」と表示されたら OK
- 1-2 分後、iPhone で Safari をリロード（下に引っ張る）

詳細は [MAINTENANCE.md](MAINTENANCE.md) を参照してください。

---

## 📊 現在の構成

## ❶ GitHub アカウント作成

### 手順

1. **ブラウザで https://github.com を開く**
   
2. **右上の「Sign up」をクリック**
   ```
   GitHub ホーム画面
   → 右上の Sign up ボタン
   ```

3. **メールアドレスを入力**
   - 普段使っているメールアドレスを入力

4. **パスワード作成**
   - 安全なパスワード（12 文字以上推奨）

5. **ユーザー名を入力**
   - 例：`onotakanori`
   - **これが重要です！** 後で使います
   - **メモしておいてください** 📝

6. **メール通知の設定**
   - `Yes` または `No` どちらでもOK

7. **CAPTCHA 認証**
   - 指示に従う

8. **メール認証**
   - GitHub からメールが来る
   - メール内のリンクをクリック

9. **完了！**
   ```
   🎉 アカウント作成完了
   → ダッシュボード画面が表示される
   ```

---

## ❷ リポジトリ（保管庫）を作成

GitHub 上にコードを保管する「場所」を作ります。

### 手順

1. **GitHub ダッシュボードで左上の「+」アイコンをクリック**
   ```
   GitHub 画面
   → 左上のプロフィール写真の上の「+」
   → "New repository"
   ```

2. **リポジトリ名を入力**
   ```
   Repository name: kyowa-menu-optimizer
   ```

3. **説明を入力（オプション）**
   ```
   Description: Menu optimization web app - GitHub Pages Edition
   ```

4. **「Public」を選択（重要！）**
   ```
   ⭕ Public （誰でも見られる）
   ⭕ Private （自分だけ）
   
   → Public を選択
   ```
   **理由：GitHub Pages を使うため**

5. **「Add a README file」は「チェックしない」**
   ```
   ☐ Add a README file
   ☐ Add .gitignore
   ☐ Choose a license
   
   → すべてチェックなし（ローカルのファイルを使うため）
   ```

6. **「Create repository」をクリック**
   ```
   🎉 リポジトリが作成される
   → https://github.com/YOUR_USERNAME/kyowa-menu-optimizer が作成される
   ```

---

## ❸ ローカルのコードを GitHub に push（保存）

ここからは**ターミナル**を使います。

### 前準備：ターミナルを開く

- **Mac**: Spotlight（Command + Space）→ "Terminal" で検索
- **Windows**: PowerShell または Git Bash を開く

### Git の初期設定（初回のみ）

ターミナルで以下のコマンドを実行します：

```bash
# Git ユーザー名を設定
git config --global user.name "Your Name"

# Git メールアドレスを設定
git config --global user.email "your-email@example.com"
```

**例：**
```bash
git config --global user.name "Onotakanori"
git config --global user.email "your-email@gmail.com"
```

### GitHub に push するコマンド

以下の**すべてのコマンド**を順番に実行してください：

```bash
# 1. プロジェクトフォルダに移動
cd /Users/onotakanori/kyowa-menu-optimizer

# 2. Git リポジトリを初期化（既にしている場合はスキップ）
git init

# 3. GitHub リモートを設定
# ⚠️ YOUR_USERNAME を自分のユーザー名に変更してください！
git remote add origin https://github.com/YOUR_USERNAME/kyowa-menu-optimizer.git

# 4. 確認：リモートが正しく設定されたか
git remote -v

# 5. すべてのファイルをステージ
git add .

# 6. コミット（コメント付きで保存）
git commit -m "Initial commit: GitHub Pages + Actions version"

# 7. ブランチ名を main に変更
git branch -M main

# 8. GitHub に push（保存）
git push -u origin main
```

### ⚠️ 重要：YOUR_USERNAME を変更する

```bash
# ❌ これはダメ
git remote add origin https://github.com/YOUR_USERNAME/kyowa-menu-optimizer.git

# ✅ これは OK（例：ユーザー名が "onotakanori" の場合）
git remote add origin https://github.com/onotakanori/kyowa-menu-optimizer.git
```

### パスワード認証の場合

実行時に以下が表示されたら：
```
Username for 'https://github.com':
```

- **Username**: GitHub ユーザー名を入力
- **Password**: GitHub パスワードを入力（画面に表示されません）

### GitHub Token 認証推奨（より安全）

パスワードの代わりに「Personal Access Token」を使う方法（推奨）：

1. GitHub Settings → Developer settings → Personal access tokens
2. Generate new token
3. `repo` と `workflow` にチェック
4. Generate token
5. 表示されたトークンをコピー
6. ターミナルの「Password:」でトークンをペースト

**詳細：** https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token

### ✅ Push 完了の確認

以下が表示されたら成功です：
```
✅ Enumerating objects: ...
✅ Counting objects: ...
✅ Writing objects: ...
✅ Total ... bytes
```

GitHub を再読込すると、ファイルが表示されます！

---

## ❹ GitHub Pages を有効化

Web サイトとして公開する設定をします。

### 手順

1. **GitHub リポジトリページを開く**
   ```
   https://github.com/YOUR_USERNAME/kyowa-menu-optimizer
   ```

2. **「Settings」タブをクリック**
   ```
   リポジトリ画面の右上
   → Code | Issues | Pull requests | ... | Settings ✓
   ```

3. **左側メニューから「Pages」をクリック**
   ```
   Settings 画面
   → 左側の "Pages" をクリック
   ```

4. **Source（ソース）を設定**
   ```
   Build and deployment
   → Source: "Deploy from a branch"
   ```

5. **Branch を設定**
   ```
   Branch: main ▼ → "main" を選択
   Folder: / (root) ▼ → "/ (root)" を選択
   ```

6. **「Save」をクリック**
   ```
   🎉 保存されます
   ```

7. **デプロイを待つ**
   ```
   数秒〜1 分で以下が表示される：
   ✅ Your site is live at https://YOUR_USERNAME.github.io/kyowa-menu-optimizer/
   ```

**URL をメモ：** 
```
https://YOUR_USERNAME.github.io/kyowa-menu-optimizer/
```

---

## ❺ GitHub Actions で初回スクレイピング実行

メニューをスクレイピング（取得）して、データを生成します。

### 手順

1. **「Actions」タブをクリック**
   ```
   GitHub リポジトリ
   → Actions タブ
   ```

2. **「🔄 Weekly Menu Scrape」をクリック**
   ```
   Workflows 一覧
   → "🔄 Weekly Menu Scrape"
   ```

3. **「Run workflow」ボタンをクリック**
   ```
   画面右上の "Run workflow" ボタン
   ```

4. **再度「Run workflow」をクリック**
   ```
   ドロップダウン確認用
   → Run workflow
   ```

5. **実行状況を確認**
   ```
   Actions 画面
   → 最新の "Weekly Menu Scrape" ジョブ
   → 🟡 実行中 → ✅ 完了
   
   時間：約 2-5 分
   ```

6. **ログを確認（オプション）**
   ```
   ジョブ名をクリック
   → すべてのステップの実行ログが表示
   ```

**成功メッセージの例：**
```
✅ Run succeeded
📅 Update menus: Mon Jan 13 ...
```

---

## ❻ アプリが動作しているか確認

### iPhone で確認（推奨）

1. **Safari を開く**

2. **アドレスバーに以下を入力**
   ```
   https://YOUR_USERNAME.github.io/kyowa-menu-optimizer/
   ```
   例：`https://onotakanori.github.io/kyowa-menu-optimizer/`

3. **エンター キーを押す**

4. **確認項目：**
   - [ ] ページが表示される（白い画面ではない）
   - [ ] 日付ドロップダウンに日付が表示される
   - [ ] メニューが読み込まれて表示される
   - [ ] ボタンが反応する

### Mac で確認（ローカルテスト）

```bash
# ローカルサーバーを起動（オプション）
cd /Users/onotakanori/kyowa-menu-optimizer/docs
python3 -m http.server 8000

# ブラウザで以下にアクセス
# http://localhost:8000
```

---

## 🎯 ホームスクリーン に追加（iPhone）

### 手順

1. **Safari でアプリページを開く**
   ```
   https://YOUR_USERNAME.github.io/kyowa-menu-optimizer/
   ```

2. **下部のシェアボタン をタップ**
   ```
   Safari 画面の下部
   → 中央のシェアボタン（↑ の矢印）
   ```

3. **「ホームスクリーン に追加」をタップ**
   ```
   メニューを下方スクロール
   → "ホームスクリーン に追加"
   ```

4. **アプリ名を確認**
   ```
   デフォルト：kyowa-menu-optimizer
   → 変更可能：「京和メニュー」とか
   ```

5. **「追加」をタップ**
   ```
   🎉 ホーム画面にアプリアイコンが追加される
   ```

6. **ホーム画面を見る**
   ```
   アイコンが表示される
   → タップでいつでも起動可能
   ```

---

## 🔄 自動更新について

### 毎週自動実行

```
毎週日曜日 21:00（JST） に自動実行
↓
最新のメニューをスクレイピング
↓
JSON ファイルを生成
↓
自動的に GitHub に保存
↓
ウェブサイトが自動更新される
```

**あなたは何もしなくて OK！**

### 手動で実行したい場合

必要に応じていつでも実行可能：

```
GitHub リポジトリ
→ Actions
→ "🔄 Weekly Menu Scrape"
→ "Run workflow"
```

---

## ❓ よくある質問と解決方法

### Q1: push の時に「Permission denied」エラー

```
❌ Permission denied (publickey)
```

**原因：** SSH キーが設定されていない

**解決：** HTTPS を使う
```bash
# SSH でエラー → HTTPS に変更
git remote set-url origin https://github.com/YOUR_USERNAME/kyowa-menu-optimizer.git
git push -u origin main
```

### Q2: GitHub Pages が表示されない

```
❌ 404 Not Found
```

**チェックリスト：**
1. Settings → Pages で「Public」になっているか？
2. Branch が「main」になっているか？
3. Folder が「/ (root)」になっているか？
4. 数分待った？（デプロイに時間がかかる）

### Q3: メニューが表示されない

```
❌ 日付ドロップダウンが空
```

**原因：** GitHub Actions がまだ実行されていない

**解決：**
1. Actions タブで「Run workflow」をクリック
2. 実行完了（✅）を待つ
3. ページをリロード（Ctrl+R または Command+R）
4. キャッシュクリア：Ctrl+Shift+Delete

### Q4: ローカルテストしたい

```bash
# docs フォルダでローカルサーバー起動
cd /Users/onotakanori/kyowa-menu-optimizer/docs
python3 -m http.server 8000

# ブラウザで以下にアクセス
# http://localhost:8000
```

### Q5: 定期実行の日時を変更したい

`.github/workflows/scrape.yml` を編集：

```yaml
# 現在：毎週日曜日 21:00 JST
schedule:
  - cron: '0 12 * * 0'  # ← この数字を変更

# 例：毎日 21:00
schedule:
  - cron: '0 12 * * *'

# 例：毎週月曜日 21:00
schedule:
  - cron: '0 12 * * 1'
```

変更後 → git push で反映

---

## ✨ 完成！

```
🎉 これであなたのシステムは完成です！

✅ 自宅 PC をオフにできる
✅ 月額 0 円で運用できる
✅ 24/7 自動で更新される
✅ iPhone でいつでもアクセス可能
✅ 友人とシェアも可能
```

---

## 📞 トラブルが発生した場合

### 手順

1. **エラーメッセージをメモする**
   ```
   例：Error: failed to push ...
   ```

2. **GitHub の Issues 機能を使う**
   ```
   https://github.com/YOUR_USERNAME/kyowa-menu-optimizer/issues
   → New issue
   ```

3. **以下を記入：**
   - エラーメッセージ
   - 何をしていたか
   - OS（Mac/Windows など）
   - ブラウザ（Safari/Chrome など）

4. **Submit new issue**

### AI にも質問できます

GitHub の概念で不明な点があれば、お気軽にどうぞ！

---

**おめでとうございます！🚀 GitHub 初心者卒業です！**

---

## 🔍 動作確認

### ローカルテスト

```bash
# ローカルで HTTP サーバーを起動
cd /Users/onotakanori/kyowa-menu-optimizer/docs
npx http-server -p 8080

# ブラウザで開く
open http://localhost:8080
```

### 確認項目

- ✅ 日付ドロップダウンが表示されている
- ✅ メニューが読み込まれている
- ✅ 栄養情報が表示されている
- ✅ メニュー選択ボタンが動作
- ✅ 最適化実行で結果が表示される

---

## 📅 スケジュール実行

### デフォルト設定

毎週 **日曜日 21:00（JST）** に自動実行

（設定ファイル: `.github/workflows/scrape.yml` の `cron: '0 12 * * 0'`）

### スケジュールを変更する場合

`.github/workflows/scrape.yml` を編集：

```yaml
on:
  schedule:
    # 毎日実行する場合
    - cron: '0 12 * * *'
    
    # 毎週月曜 21:00 に実行する場合
    - cron: '0 12 * * 1'
```

変更後は `git push` で自動更新されます

---

## 🆘 トラブルシューティング

### Q. GitHub Pages が表示されない

A. Settings → Pages で以下を確認：
- Source が正しく設定されているか
- Branch が `main` か
- Folder が `/` または `/docs` か

### Q. Actions が失敗している

A. Actions タブのログを確認：
1. "🔄 Weekly Menu Scrape" をクリック
2. 最新の実行をクリック
3. ログを見て、エラーを確認
4. 多くの場合は Playwright がブラウザをダウンロード中です（初回は長い）

### Q. メニューが更新されない

A. 以下を確認：
1. Actions が成功しているか
2. `git push` で更新が反映されているか
3. ブラウザキャッシュをクリアして再度アクセス

### Q. 古いメニューが残っている

A. キャッシュをクリア：
```bash
# ローカルで古いファイルを削除
rm -rf docs/menus/*
rm docs/available-dates.json

# GitHub Actions を手動実行して再生成
```

---

## 📊 ファイル構成確認

以下のファイルが正しく配置されているか確認：

```
kyowa-menu-optimizer/
├── .github/
│   └── workflows/
│       └── scrape.yml                    ✅ 存在
├── docs/
│   ├── index.html                        ✅ 存在
│   ├── app.js                            ✅ 修正済み
│   ├── style.css                         ✅ 存在
│   ├── available-dates.json              ✅ 自動生成
│   └── menus/
│       ├── menus_2026-01-13.json         ✅ 自動生成
│       └── ...
├── src/
│   ├── scraper/
│   ├── utils/
│   ├── optimizer/
│   └── index.js
├── prescrap.js                           ✅ 修正済み
├── package.json                          ✅ 確認
├── .gitignore                            ✅ 作成
└── README.md                             ✅ 作成
```

---

## 🎯 本番環境デプロイ完了後

1. **iPhone で アクセス**
   ```
   https://YOUR_USERNAME.github.io/kyowa-menu-optimizer/
   ```

2. **ホームスクリーン に追加**（PWA 対応予定）
   - Safari: 共有 → ホームスクリーンに追加

3. **定期的に 更新**
   - 毎週日曜日 21:00 に自動更新
   - または手動で GitHub Actions を実行

---

## ✨ 完全無料で 24/7 稼働

- ✅ GitHub アカウント：無料
- ✅ GitHub Pages：無料（無制限）
- ✅ GitHub Actions：無料（月 2000 分無料）
- ✅ Playwright：オープンソース
- ✅ サーバー不要：フロントエンドのみ
- ✅ 自宅 PC 常時オン不要

---

## 📞 サポート

問題が発生した場合、以下を確認：

1. `.github/workflows/scrape.yml` が正しいか
2. `docs/` ディレクトリが存在するか
3. GitHub Pages が有効か（Settings → Pages）
4. `git push` で反映されたか（GitHub で確認）

---

**次のコマンドで完成です：**

```bash
git add .
git commit -m "GitHub Pages edition: ready for deployment"
git push origin main
```

その後、GitHub で Pages を有効化すれば、完成です！🎉
