# GitHub Personal Access Token 設定ガイド

## 📋 概要
管理者ページからプライベートリポジトリ `kyowa-menu-history` にデータを保存するため、Personal Access Tokenを設定します。

## 🔑 Personal Access Token の取得

### Step 1: GitHubの設定ページへ移動
1. GitHubにログイン
2. 右上のプロフィールアイコンをクリック
3. **Settings** を選択
4. 左サイドバーの一番下にある **Developer settings** をクリック

### Step 2: トークンの作成
1. **Personal access tokens** → **Tokens (classic)** を選択
2. **Generate new token** → **Generate new token (classic)** をクリック
3. 以下の情報を入力：

   **Note (トークン名):**
   ```
   kyowa-menu-optimizer-admin
   ```

   **Expiration (有効期限):**
   - 推奨: `90 days` または `No expiration`（期限なし）

   **Select scopes (権限):**
   - ✅ **`repo`** （Full control of private repositories）
     - これにチェックを入れると、以下が自動的に選択されます：
       - `repo:status`
       - `repo_deployment`
       - `public_repo`
       - `repo:invite`
       - `security_events`

4. ページ最下部の **Generate token** をクリック

### Step 3: トークンのコピー
⚠️ **重要**: トークンは一度しか表示されません！

1. 緑色の背景で表示されるトークン（`ghp_` で始まる文字列）をコピー
2. 安全な場所に保存（パスワードマネージャー推奨）

**トークン例:**
```
ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

## 🔧 admin.js への設定

### Option 1: コードに直接設定（簡単）

1. `admin.js` を開く
2. 18行目付近の以下の行を編集：

```javascript
this.GITHUB_TOKEN = null; // ← ここを変更
```

↓

```javascript
this.GITHUB_TOKEN = 'ghp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // あなたのトークン
```

### Option 2: ブラウザのローカルストレージで設定（安全）

将来的に実装予定（トークンをコードに直書きしない方法）

## ✅ 動作確認

1. 管理者ページ (`admin.html`) にアクセス
2. ログイン
3. 日付を選択してメニュー読込
4. メニューを選択して「記録を保存」
5. 保存成功メッセージを確認：
   - ✅ **「GitHub にも保存しました！」** → 成功
   - ⚠️ **「保存しました（ローカルのみ）」** → トークン未設定
   - ❌ **「GitHub保存失敗: ...」** → エラー発生

6. GitHubの `kyowa-menu-history` リポジトリを確認：
   ```
   data/history/2026-01-20.json
   ```
   というファイルが作成されているはずです

## 🔒 セキュリティ注意事項

### ⚠️ やってはいけないこと
- ❌ トークンを公開リポジトリにコミットしない
- ❌ トークンをチャット/メールで送信しない
- ❌ スクリーンショットに含めない

### ✅ 推奨事項
- ✅ トークンはパスワードマネージャーで管理
- ✅ 定期的にトークンを再生成（90日ごと推奨）
- ✅ 使わなくなったトークンは削除

### トークンの削除方法
1. GitHub Settings → Developer settings → Personal access tokens
2. 削除したいトークンを見つけて **Delete** をクリック

## 🐛 トラブルシューティング

### エラー: "403 Forbidden"
**原因**: トークンの権限が不足しています  
**解決**: トークンに `repo` スコープが付与されているか確認

### エラー: "404 Not Found"
**原因**: リポジトリ名またはユーザー名が間違っています  
**解決**: `admin.js` の以下を確認：
```javascript
this.GITHUB_OWNER = '1onotakanori-art'; // ← 正しいユーザー名
this.GITHUB_REPO = 'kyowa-menu-history'; // ← 正しいリポジトリ名
```

### エラー: "401 Unauthorized"
**原因**: トークンが無効または期限切れです  
**解決**: 新しいトークンを生成して設定し直す

### 「ローカルのみ」と表示される
**原因**: `this.GITHUB_TOKEN` が `null` のままです  
**解決**: トークンを設定して再読み込み

## 📝 次のステップ

トークン設定が完了したら：

1. ✅ 初期構造ファイルを `kyowa-menu-history` にpush
2. ✅ 管理者ページから実際にデータ保存をテスト
3. 🚧 学習パイプラインの実装（Week 3-4）
4. 🚧 一般公開ページへの推薦機能追加（Week 5-6）

---

**作成日**: 2026-01-20  
**バージョン**: 1.0.0
