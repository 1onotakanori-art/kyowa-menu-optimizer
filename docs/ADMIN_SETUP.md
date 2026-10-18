# 食事記録の管理画面（admin.html）

実際に食べたメニューを記録する画面です。記録は AI 推奨の学習データ（Supabase の `meal_history`）になります。

URL: https://1onotakanori-art.github.io/kyowa-menu-optimizer/admin.html

## 使い方

1. 日付を選ぶ（初期値は今日）
2. 「メニュー読込」を押す（Supabase の `menus` から、その日のメニューを読み込む）
3. 食べたメニューにチェックを入れ、必要なら星で評価する（1〜5、初期値は 3）
4. 栄養の合計を確認して「記録を保存」を押す

すでに記録がある日を読み込むと、保存済みの選択と評価が復元されます。画面下には最近の記録が表示されます。

## 保存先

| 保存先 | 内容 |
|---|---|
| Supabase の `meal_history` | 本来の保存先。日付ごとに1行（`date` で upsert）。テーブル定義は [supabase/schema/meal_history.sql](../supabase/schema/meal_history.sql) |
| ブラウザの localStorage（`history_YYYY-MM-DD`） | 控え。Supabase から読めないときの読み込み元にもなる |

Supabase への保存に失敗した場合は「ローカル保存成功、Supabase保存失敗」と表示されます。localStorage には残っているので、通信が戻ってから保存し直してください。

## 注意: アクセス制限がない

今の管理画面にはログインがなく、URL を知っていれば誰でも開けます。`meal_history` も anon キーで書き込める設定です。見直しは [VERCEL_REDESIGN_PLAN.md](VERCEL_REDESIGN_PLAN.md) の「スコープ外」に挙げた RLS の見直しで扱います。

## 記録したあと

記録は週次処理の再学習（`npm run weekly:finish` の中の `ml:retrain`）で使われます。すぐに反映したい場合は、[AI_QUICK_START.md](AI_QUICK_START.md) の手順で再学習と AI 推奨の作り直しを行ってください。
