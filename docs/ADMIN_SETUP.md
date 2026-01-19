# 管理者ページ - セットアップガイド

## 📋 概要

管理者用ページ（`admin.html`）で食事記録を登録・管理できます。

## 🚀 使い方

### 1. アクセス
```
https://1onotakanori-art.github.io/kyowa-menu-optimizer/admin.html
```

### 2. ログイン
- **デフォルトパスワード**: `kyowa2026`
- セッション中は認証状態が保持されます

### 3. 食事記録の登録
1. 日付を選択
2. 「メニュー読込」ボタンをクリック
3. 食べたメニューにチェック
4. 栄養合計を確認
5. 「記録を保存」ボタンをクリック

### 4. 履歴の確認
- 最近の記録5件が自動表示されます

## 🔧 現在の実装状態

### ✅ 実装済み（Phase 1）
- [x] 簡易パスワード認証
- [x] 日付選択UI
- [x] メニュー読込（パブリックリポジトリから）
- [x] メニュー選択（チェックボックス）
- [x] 栄養合計の表示
- [x] ローカルストレージへの保存
- [x] 履歴表示

### 🚧 未実装（Phase 2以降）
- [ ] GitHub API連携（プライベートリポジトリへの保存）
- [ ] Personal Access Token設定
- [ ] 既存履歴の編集機能
- [ ] データのエクスポート機能

## 🔐 セキュリティ

### 現在の認証方式
- **クライアントサイド認証**（簡易版）
- パスワードは `admin.js` にハードコード
- セッションストレージで認証状態を管理

### 注意事項
⚠️ **重要**: 
- この認証は簡易的なものです
- JavaScriptで実装されているため、コードを見れば回避可能です
- 本格的な保護が必要な場合は、別の方法を検討してください

### 改善案（将来的に）
1. **サーバーサイド認証**
   - GitHub Pagesでは不可能
   - Vercel/Netlify Functions等を使用

2. **GitHub認証**
   - GitHub OAuthで本人確認
   - Private Repo へのアクセス権で制御

3. **完全ローカル運用**
   - `admin.html` を `gh-pages` ブランチから除外
   - ローカルでのみ起動

## 📦 データ保存

### Phase 1: ローカルストレージ（現在）
- ブラウザのローカルストレージに保存
- データ形式: `history_YYYY-MM-DD`
- **制限**: 同じブラウザでのみ閲覧可能

### Phase 2: GitHub API（実装予定）
- プライベートリポジトリに保存
- Personal Access Tokenで認証
- どのデバイスからでもアクセス可能

## 🔧 カスタマイズ

### パスワード変更
`admin.js` の以下の行を編集:
```javascript
this.PASSWORD = 'kyowa2026'; // ← 変更
```

### GitHub設定（Phase 2）
`admin.js` の以下の設定を変更:
```javascript
this.GITHUB_OWNER = '1onotakanori-art'; // ← あなたのユーザー名
this.GITHUB_REPO = 'kyowa-menu-history'; // ← プライベートリポジトリ名
this.GITHUB_TOKEN = null; // ← Personal Access Token
```

## 📝 データ形式

### 保存されるJSON
```json
{
  "date": "2026-01-20",
  "eaten": ["肉豆腐", "ご飯（大）", "味噌汁"],
  "available": ["肉豆腐", "ご飯（大）", ...全メニュー],
  "nutrition": {
    "total": {
      "エネルギー": 850,
      "たんぱく質": 35.5,
      "脂質": 22.3,
      "炭水化物": 95.2,
      "野菜重量": 180
    }
  },
  "timestamp": "2026-01-20T12:34:56.789Z"
}
```

## 🐛 トラブルシューティング

### ログインできない
- パスワードが `kyowa2026` であることを確認
- ブラウザのキャッシュをクリア

### メニューが読み込めない
- 日付のメニューデータが存在するか確認
- `menus/menus_YYYY-MM-DD.json` が存在するか確認
- ブラウザのコンソールでエラーを確認

### 保存ができない
- メニューを選択しているか確認
- ブラウザのローカルストレージが有効か確認

## 🚀 次のステップ

1. **プライベートリポジトリ作成**
   ```bash
   # GitHubで新しいプライベートリポジトリを作成
   # リポジトリ名: kyowa-menu-history
   ```

2. **Personal Access Token取得**
   - GitHub Settings → Developer settings → Personal access tokens
   - スコープ: `repo` (Full control of private repositories)

3. **GitHub API連携実装**
   - `admin.js` の `saveToGitHub()` メソッドを実装
   - GitHub REST API でファイルをコミット

4. **学習パイプライン準備**
   - `src/learning/` ディレクトリ作成
   - 学習スクリプトの実装開始

---

**作成日**: 2026-01-20  
**バージョン**: 1.0.0 (Phase 1)
