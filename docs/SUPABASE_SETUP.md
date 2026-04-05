# 🔷 Supabase セットアップガイド

このガイドでは、Kyowa Menu Optimizer を Supabase と連携させる手順を説明します。

## 📋 概要

Supabase連携により、以下が可能になります：
- メニューデータをクラウドで一元管理
- GitHub Pages からリアルタイムでデータ取得
- ローカルファイル（menus/*.json）からの自動移行

## 🎯 前提条件

- Supabaseアカウント（無料プランで可）
- Node.js がインストール済み
- 本リポジトリをクローン済み

## 📝 セットアップ手順

### 1. Supabase プロジェクトの作成

1. [Supabase](https://supabase.com/) にアクセスしてログイン
2. 「New Project」をクリック
3. プロジェクト名、データベースパスワード、リージョンを設定
4. プロジェクトが作成されるまで待機（1-2分）

### 2. データベーステーブルの作成

Supabase ダッシュボードの **SQL Editor** で以下のSQLを実行：

```sql
-- メニューテーブルの作成
CREATE TABLE IF NOT EXISTS menus (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL,
  menu_name TEXT NOT NULL,
  nutrition JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, menu_name)
);

-- インデックスの作成（検索高速化）
CREATE INDEX IF NOT EXISTS idx_menus_date ON menus(date);
CREATE INDEX IF NOT EXISTS idx_menus_date_menu_name ON menus(date, menu_name);

-- RLS（Row Level Security）の有効化
ALTER TABLE menus ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザーによる読み取りを許可（フロントエンドから読み込むため）
CREATE POLICY "Allow anonymous read access"
  ON menus
  FOR SELECT
  USING (true);

-- サービスロールによる全操作を許可（スクレイピング時の書き込み用）
CREATE POLICY "Allow service role all access"
  ON menus
  FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
```

### 3. API キーの取得

Supabase ダッシュボードの **Settings** → **API** から以下をコピー：

1. **Project URL**: `https://xxxxx.supabase.co`
2. **anon public key**: フロントエンド用（公開OK）
3. **service_role key**: バックエンド用（**絶対に公開しない**）

### 4. 環境変数の設定

#### ローカル環境（Mac/Linux）

```bash
# ~/.zshrc または ~/.bashrc に追加
export SUPABASE_SERVICE_KEY="your-service-role-key-here"

# 設定を反映
source ~/.zshrc
```

#### GitHub Actions（自動スクレイピング用）

1. GitHub リポジトリの **Settings** → **Secrets and variables** → **Actions** に移動
2. 「New repository secret」をクリック
3. 以下を設定：
   - Name: `SUPABASE_SERVICE_KEY`
   - Secret: サービスロールキーをペースト

### 5. コード内のキーを更新

#### `app.js` の匿名キーを更新（7-9行目）

```javascript
const _supabaseClient = window.supabase.createClient(
  'https://YOUR_PROJECT_URL.supabase.co',  // ← あなたのProject URL
  'YOUR_ANON_KEY'  // ← あなたのanon public key
);
```

#### 確認：以下のファイルにはProject URLがハードコードされています

- `prescrap.js` (19行目)

必要に応じて、あなたのSupabase Project URLに変更してください。

### 6. 依存パッケージのインストール

```bash
npm install
```

### 7. 初期データのアップロード

`prescrap.js` を実行すると、スクレイピングと同時に Supabase へのアップロードも行われます：

```bash
npm run scrape
```
```

## ✅ 動作確認

### フロントエンドの確認

1. ブラウザで `index.html` を開く（ローカル、またはGitHub Pages）
2. 日付セレクターにメニュー日付が表示されることを確認
3. 日付を選択してメニューが読み込まれることを確認

### デバッグ方法

ブラウザの開発者ツール（F12）のコンソールで以下を実行：

```javascript
// Supabase接続テスト
const { data, error } = await _supabaseClient
  .from('menus')
  .select('date')
  .limit(5);

console.log('データ:', data);
console.log('エラー:', error);
```

## 🔄 日常運用

### 新しいメニューをスクレイピング＋アップロード

```bash
# 環境変数が設定されていれば自動的にSupabaseにアップロード
npm run scrape
```

または

```bash
node prescrap.js
```

- `SUPABASE_SERVICE_KEY` が設定されている場合：ローカル保存 + Supabase アップロード
- 設定されていない場合：ローカル保存のみ

### GitHub Actions での自動スクレイピング

`.github/workflows/scrape.yml` に `SUPABASE_SERVICE_KEY` シークレットが設定されていれば、GitHub Actions実行時に自動的にSupabaseへアップロードされます。

## 🔐 セキュリティのベストプラクティス

### ✅ 推奨

- サービスロールキーは環境変数で管理
- app.js の匿名キーは公開OK（読み取り専用ポリシー設定済み）

### ❌ 禁止

- サービスロールキーをコードにハードコード
- サービスロールキーをGitにコミット
- `.env` ファイルをコミット（`.gitignore` に追加すること）

## 🐛 トラブルシューティング

### エラー: `SUPABASE_SERVICE_KEY が設定されていません`

```bash
# 環境変数を確認
echo $SUPABASE_SERVICE_KEY

# 未設定の場合は設定
export SUPABASE_SERVICE_KEY="your-service-role-key"
```

### エラー: `Supabase upsert エラー`

1. テーブル `menus` が作成されているか確認
2. サービスロールキーが正しいか確認
3. Supabase ダッシュボードの **Table Editor** でデータを確認

### エラー: `window.supabase is not defined`

`index.html` に Supabase CDN が追加されているか確認：

```html
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
```

### フロントエンドでデータが読み込めない

1. ブラウザのコンソールでエラーを確認
2. `app.js` の Supabase URL と匿名キーが正しいか確認
3. Supabase ダッシュボードで RLS ポリシーが設定されているか確認

## 📚 関連ドキュメント

- [Supabase 公式ドキュメント](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- 本プロジェクトの [README.md](../README.md)
