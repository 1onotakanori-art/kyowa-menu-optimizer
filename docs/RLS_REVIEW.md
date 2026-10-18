# ai_selections / meal_history の RLS 見直し

共和食堂メニュー最適化アプリの Supabase で、公開されている anon キーを使えば誰でも
`ai_selections` と `meal_history` を書き換えられる状態になっていた。これを直す。

- マイグレーション: `supabase/migrations/20261019120000_tighten_ai_selections_meal_history_rls.sql`
- 調査日: 2026-10-18（本番 DB は読み取りのみで確認）

## 1. 現状（本番 DB）

| テーブル | ポリシー | 対象 | 内容 |
|---|---|---|---|
| ai_selections | Allow anonymous read access | public | SELECT `true` |
| ai_selections | Allow anonymous insert/update | public | **ALL `true` / `true`**（anon で追加・更新・削除できる） |
| meal_history | public read meal_history | public | SELECT `true`（個人の食事記録を誰でも読める） |
| meal_history | public write meal_history | public | **INSERT `true`** |
| meal_history | public update meal_history | public | **UPDATE `true` / `true`**（全行を書き換えられる） |
| meal_history | service_role full access on meal_history | public | ALL `auth.role() = 'service_role'`（service_role は RLS をバイパスするので意味がない） |

- どちらのテーブルも anon / authenticated に SELECT・INSERT・UPDATE・DELETE・TRUNCATE などが付与されたまま。
- 件数: ai_selections 168 行、meal_history 29 行。
- Auth ユーザーは 1 人（`app_metadata.role` を持つユーザーはまだいない）。

### SQL ファイルとのずれ

- `ai_selections`: `supabase/schema/ai_selections.sql` と一致。
- `meal_history`: `supabase/schema/meal_history.sql` とは別物。
  - ポリシーが `FOR ALL` 1 本ではなく SELECT / INSERT / UPDATE の 3 本 + service_role 用。anon の DELETE は RLS で通らない（UPDATE で中身は消せる）。
  - `id` は BIGSERIAL ではなく `uuid default gen_random_uuid()`。`user_name`・`day_of_week`・`timestamp` は NULL 可。
  - 更新時刻トリガーの関数は `update_meal_history_updated_at` ではなく `update_updated_at`。
- どちらのテーブルもマイグレーション履歴（`supabase_migrations`）には無く、SQL Editor で直接作られている。

## 2. 書き込み元（と読み取り元）

| 処理 | テーブル | 操作 | 使っているキー（変更前） |
|---|---|---|---|
| `ml/generate_ai_selections.py`（`npm run ml:regen`） | ai_selections | upsert | **anon**（`ml/supabase_data_loader.py` に直書き） |
| `ml/update_weekly.py`（`npm run ml:weekly` / `ml:regen-only`） | ai_selections | upsert（`upload_to_supabase` を再利用） | **anon** |
| `ml/import_set_commentary.py`（`npm run set:finish`） | ai_selections | update `set_comment` | **anon** |
| `admin.html` / `admin.js` | meal_history | upsert（`onConflict: 'date'`） | **anon**（ログインなし。以前の固定パスワードもコミット 262ef8a で削除済み） |
| `app.js`（トップページ） | ai_selections | select | anon |
| `ml/generate_set_commentary_input.py` | ai_selections | select | anon |
| `ml/supabase_data_loader.py`（学習データ） | meal_history | select | anon |
| `admin.js` | meal_history | select | anon |

ML の Python は共通の `SupabaseDataLoader` を使っているので、キーの切り替えはこの 1 か所で済む。
`scripts/prescrap.js` / `scripts/upload-to-supabase.js`（menus テーブル）はすでに `SUPABASE_SERVICE_KEY` を使っている。

## 3. 新しいポリシー

| テーブル | anon | authenticated（一般） | authenticated（管理者） | service_role |
|---|---|---|---|---|
| ai_selections | SELECT | SELECT | SELECT | すべて（RLS バイパス） |
| meal_history | なし | なし | SELECT / INSERT / UPDATE | すべて（RLS バイパス） |

- 管理者 = JWT の `app_metadata.role = 'admin'`。`app_metadata` は本人が書き換えられない（`user_metadata` とは違う）。
  判定は `public.is_admin()`（`search_path = ''`、authenticated のみ実行可）。
- `meal_history` は個人の食事記録なので、参照も管理者と service_role に絞る。トップページは使っていない。
- DELETE はどちらのテーブルも service_role 以外には許可しない（使っている処理がない）。
- テーブル権限も `revoke all` してから必要なものだけ付与（通知機能のテーブルと同じ書き方）。
- ついでに Security Advisor が指摘している更新時刻トリガー関数 2 つの `search_path` を固定する。

### この PR で一緒に変えたコード

- `ml/supabase_data_loader.py`: anon キーの直書きをやめ、環境変数 `SUPABASE_SERVICE_KEY` を使う。未設定ならエラー。
- `admin.html` / `admin.js`: Supabase Auth のメールリンクでログインする画面を追加。管理者でなければメイン画面を出さない。
  管理画面からはアカウントを作らない（`shouldCreateUser: false`）。

マイグレーション適用前にリリースしても、service_role はいまも全権限があり、anon 用のポリシーも残っているので ML 側は動く。
ただし admin.js は `role = 'admin'` のないアカウントにはメイン画面を出さないので、**管理者の指定は PR のマージより前に済ませる**。

## 4. 適用手順（本番）

順番が大事。権限の付与 → コード → マイグレーションの順。
今のポリシーのままなら、権限を先に付けても害はない。

1. Supabase の Authentication → URL Configuration の Redirect URLs に admin.html の URL が含まれているか確認する
   （例: `https://1onotakanori-art.github.io/kyowa-menu-optimizer/**`）。含まれていないとメールのリンクがトップに飛ぶ。
2. 管理者にするユーザーを指定する（SQL Editor）。

   ```sql
   update auth.users
      set raw_app_meta_data = raw_app_meta_data || '{"role": "admin"}'
    where email = '<管理者のメールアドレス>';
   ```

3. この PR をマージし、GitHub Pages の admin.html にログインして、記録の読み込みと保存ができることを確認する。
4. ML を動かす PC で `SUPABASE_SERVICE_KEY` が設定されていることを確認する（`npm run weekly` ではすでに必要）。
   `npm run ml:regen` などを 1 回動かし、ai_selections に保存できることを確かめる。
5. マイグレーションを適用する。
6. 確認する。
   - トップページで AI 推薦が表示される（anon の SELECT）。
   - anon キーで ai_selections に upsert / delete すると失敗する。meal_history の select は 0 件になる。
   - admin.html で記録の読み込みと保存ができる（`app_metadata` は新しいトークンから反映されるので、手順 3 より前にログインしていたら入り直す）。
   - `npm run ml:regen` が ai_selections に保存できる。学習データを meal_history から読める。
   - Security Advisor を見直す。

### 戻し方

マイグレーションの前の状態に戻すなら、`supabase/schema/ai_selections.sql` / 本書 1 章の表にあるポリシーを作り直し、
`grant all on public.ai_selections, public.meal_history to anon, authenticated;` を実行する。

## 5. 今回のスコープ外（気づいたこと）

- `supabase/schema/ai_selections.sql` / `supabase/schema/meal_history.sql` はテーブル定義の元として本番とずれている。
  Vercel 移行の際にベースラインのマイグレーションとして取り込み直すとよい。
- Auth の「漏えいパスワード保護」が無効（Security Advisor の WARN）。パスワードを使っていないので影響は小さい。
- `admin.js` は anon キーを直書きしている。anon キーは公開前提なので問題ではないが、Vercel 移行時に環境変数へまとめるとよい。
