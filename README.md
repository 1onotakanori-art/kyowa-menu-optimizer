# Kyowa Menu Optimizer

共和食堂のメニューから、栄養目標に合うメニューの組み合わせを提案する Web アプリです。

公開 URL: https://kyowa-menu-optimizer.vercel.app/

> 2026-10 に GitHub Pages から Vercel へ移行し、画面を作り直しました（[docs/VERCEL_REDESIGN_PLAN.md](docs/VERCEL_REDESIGN_PLAN.md)）。旧 URL（https://1onotakanori-art.github.io/kyowa-menu-optimizer/）は、`gh-pages` ブランチの転送用ページで新しいサイトへ転送しています。

## できること

- **メニュー最適化**: 日付と E/P/F/C/V（エネルギー・たんぱく質・脂質・炭水化物・野菜重量）の目標を決めると、目標に近い組み合わせを提案する。メニューごとに固定・除外を指定できる
- **AI 推奨**: 過去の食事記録から好みを学習し、「1食として成立するセット」を提案する（AI タブ）
- **ダッシュボード**: AI 推奨セットの傾向（スコア、PFC 比、よく推奨されるメニュー、セット・1品ごとの統計）を期間ごとに見る（`/dashboard`）
- **メニュー通知**: 登録した条件（メニュー名・キーワード・栄養やアレルゲン）に当日のメニューが合うと、朝 7:00 にメールで知らせる（`/notify`）
- **食事記録**: 実際に食べたメニューを記録する管理画面（`/admin`、管理者のみ）。AI 推奨の学習データになる

## 全体の構成

```
[Windows の常時起動 PC（タスクスケジューラ）]
  毎週日曜 6:00  npm run weekly:prepare
    スクレイピング → menus/ に保存 → Supabase にアップロード → menus/ を main に push
    → Claude 解析用の入力を作成
  （Claude Desktop の Cowork タスクで新規メニューを解析）
  毎週日曜 8:00  npm run weekly:finish
    解析結果の取り込み → モデル再学習 → AI 推奨を作成して Supabase に保存

[Supabase]
  menus / ai_selections / meal_history / 通知用テーブル
  Edge Functions: send-daily-digest（毎朝 7:00 の通知メール）、unsubscribe（配信停止）

[フロントエンド（web/、Vercel で配信）]
  Vite + React の静的サイト。Supabase から直接データを読む（ログインは Supabase Auth のメールリンク）
  main への push で本番に、PR ごとにプレビューにデプロイされる
```

## ディレクトリ構成

```
.github/workflows/   Supabase の keep-alive（毎日 1 回 DB に書き込む）
docs/                計画書・セットアップ手順
menus/               スクレイピング結果の JSON（週次処理が自動で push）
ml/                  AI 推薦パイプライン（Python）。学習済みモデルは ml/model/
scripts/             スクレイピング・アップロード・週次処理の Node スクリプト
scripts/windows/     Windows のセットアップとタスク登録
src/scraper/         スクレイパー本体（Playwright）
src/utils/           日付ユーティリティ
supabase/functions/  Edge Functions（通知メール・配信停止）と共通の判定ロジック
supabase/migrations/ 通知機能のマイグレーション
supabase/schema/     手動で作成したテーブルの定義 SQL（ai_selections など）
tests/               単体テスト（node:test）
web/                 フロントエンド（Vite + React + TypeScript + Tailwind CSS。Vercel の Root Directory）
  index.html, dashboard.html, notify.html, admin.html, unsubscribe.html   各ページの入口
  src/lib/           画面に依存しない処理（最適化・集計・Supabase の読み書きなど。tests/web/ でテスト）
  src/components/    画面の部品
  src/pages/         各ページ
```

`gh-pages` ブランチには、旧 GitHub Pages を新しいサイトへ転送するページだけが置いてあります。

## セットアップ

Windows 11 の常時起動 PC で動かす前提です。

```powershell
git clone https://github.com/1onotakanori-art/kyowa-menu-optimizer.git
cd kyowa-menu-optimizer
npm run setup:win11
npm run task:register:win11
```

詳しい手順は [docs/WINDOWS11_MIGRATION.md](docs/WINDOWS11_MIGRATION.md) を参照してください。スクレイピングと Supabase へのアップロードには、環境変数 `SUPABASE_SERVICE_KEY` が必要です（[docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md)）。

## よく使うコマンド

| コマンド | 内容 |
|---|---|
| `npm test` | 単体テスト |
| `npm --prefix web run dev` | 新フロントエンドの開発サーバー（http://localhost:5173） |
| `npm --prefix web run build` | 新フロントエンドの型チェックとビルド（`web/dist/`） |
| `npm run scrape` / `scrape:10` / `scrape:20` | 5 / 10 / 20 日分をスクレイピングして `menus/` に保存し、Supabase にアップロード |
| `npm run upload` | `menus/` の JSON を Supabase にアップロード（日付を指定することもできる） |
| `npm run menus:push` | `menus/` の変更だけを main にコミットして push |
| `npm run weekly:prepare` | 週次処理の前半（スクレイピング → アップロード → push → Claude 解析の入力作成） |
| `npm run weekly:finish` | 週次処理の後半（解析結果の取り込み → 再学習 → AI 推奨の作成） |
| `npm run ml:dry-run` | 新しいメニューの数と、Claude 解析のおおよその費用を確認する（何も実行しない） |
| `npm run ml:retrain` | モデルを再学習して `ml/model/` に保存 |
| `npm run ml:regen` | 全日付の AI 推奨を作り直して Supabase に保存 |
| `npm run set:prepare` / `set:finish` | AI 推奨セットに Claude の「ひとこと解説」を付ける（任意） |

`menus:push` は、チェックアウトが main ブランチのときだけ動きます。`menus/` 以外に未 push のコミットがある場合や push に失敗した場合は、警告を出して見送ります（週次処理は止めず、次回に再試行します）。

## AI 推奨のしくみ

AI 推奨は単品の寄せ集めではなく、食事として成立する1セットを提案します。

- 各メニューを主食・主菜・副菜・汁物・デザートに分類し、普段選ぶ役割のバランスに合わせる
- Claude で作った嗜好プロファイル（好きな調理法・食材・ジャンル）をスコアに加える
- 「唐揚げ＋唐揚げミニ」のような同じ系統の重複を避ける
- 品数は過去に実際に選んだ品数の範囲に収める
- E/P/F/C/V の合計と PFC バランスを過去の平均に近づける

関連コードは `ml/generate_ai_selections.py` と `ml/update_weekly.py` です。詳しくは [docs/AI_QUICK_START.md](docs/AI_QUICK_START.md) を参照してください。

## ドキュメント

| ファイル | 内容 |
|---|---|
| [docs/VERCEL_REDESIGN_PLAN.md](docs/VERCEL_REDESIGN_PLAN.md) | Vercel 移行と画面リデザインの計画 |
| [docs/EMAIL_NOTIFICATION_PLAN.md](docs/EMAIL_NOTIFICATION_PLAN.md) | メニュー通知機能の計画と進捗 |
| [docs/WINDOWS11_MIGRATION.md](docs/WINDOWS11_MIGRATION.md) | Windows 11 PC でのセットアップと週次タスク |
| [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) | Supabase の設定 |
| [docs/AI_QUICK_START.md](docs/AI_QUICK_START.md) | AI 推奨の学習と作成 |
| [docs/ADMIN_SETUP.md](docs/ADMIN_SETUP.md) | 食事記録の管理画面 |

## トラブルシューティング

- **メニューが表示されない / 日付がない**: 週次処理が動いたか確認する（`logs/weekly-prepare.log`、タスクスケジューラの `KyowaMenuWeeklyPrepare`）。手動で `npm run weekly:prepare` を実行してもよい
- **「日付が見つかりません」**: メニューサイトがまだ更新されていない可能性がある。翌日以降に再実行する
- **Playwright のエラー**: `npx playwright install chromium` を実行する

---

個人利用を目的としたプロジェクトです。スクレイピング対象サイトの利用規約を守って使ってください。
