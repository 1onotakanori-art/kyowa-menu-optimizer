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

Supabase ダッシュボードの **SQL Editor** で以下のSQLを実行します。`ai_selections`・`meal_history`・`project_keepalive` の定義は [supabase/schema/](../supabase/schema/) に、通知機能のテーブルは [supabase/migrations/](../supabase/migrations/) にあります。

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

### 5. コード内のキーを更新

#### フロントエンド（`web/`）の接続先

`web/src/lib/supabase.ts` に Project URL と anon public key の初期値があります。別のプロジェクトにつなぐときは、Vercel の環境変数 `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` を設定してください（ローカルでは `web/.env.local` に書けます）。

#### 確認：以下のファイルにはProject URLがハードコードされています

- `scripts/prescrap.js`（19行目）
- `scripts/upload-to-supabase.js`（18行目）

必要に応じて、あなたのSupabase Project URLに変更してください。

### 6. 依存パッケージのインストール

```bash
npm install
```

### 7. 初期データのアップロード

`npm run scrape`（`scripts/prescrap.js`）を実行すると、スクレイピングと同時に Supabase へのアップロードも行われます：

```bash
npm run scrape
```

## ✅ 動作確認

### フロントエンドの確認

1. `npm --prefix web run dev` で開発サーバーを起動し、http://localhost:5173 を開く（または本番の https://kyowa-menu-optimizer.vercel.app）
2. 日付セレクターにメニュー日付が表示されることを確認
3. 日付を選択してメニューが読み込まれることを確認

### デバッグ方法

ブラウザの開発者ツール（F12）の「ネットワーク」で、`/rest/v1/menus` へのリクエストの応答を確認します。画面にも、読み込めなかったときはエラーの内容が表示されます。

## 🔄 日常運用

### 新しいメニューをスクレイピング＋アップロード

```bash
# 環境変数が設定されていれば自動的にSupabaseにアップロード
npm run scrape
```

- `SUPABASE_SERVICE_KEY` が設定されている場合：ローカル保存 + Supabase アップロード
- 設定されていない場合：ローカル保存のみ

### 週次の自動スクレイピング

Windows タスクスケジューラ（`KyowaMenuWeeklyPrepare`）が `npm run weekly:prepare` を実行し、ローカル保存と Supabase アップロードを行います（[WINDOWS11_MIGRATION.md](WINDOWS11_MIGRATION.md)）。

## 🔐 セキュリティのベストプラクティス

### ✅ 推奨

- サービスロールキーは環境変数で管理
- フロントエンドの匿名キーは公開前提（書き込みは RLS で管理者・本人・service_role だけに絞っている）

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

### フロントエンドでデータが読み込めない

1. ブラウザのコンソールでエラーを確認
2. `web/src/lib/supabase.ts`（または Vercel の環境変数）の Supabase URL と匿名キーが正しいか確認
3. Supabase ダッシュボードで RLS ポリシーが設定されているか確認

## 📚 関連ドキュメント

- [Supabase 公式ドキュメント](https://supabase.com/docs)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/introduction)
- 本プロジェクトの [README.md](../README.md)
