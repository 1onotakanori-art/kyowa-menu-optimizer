# Vercel 移行 & 画面リデザイン — 実装計画

> ステータス: **方針決定済み・未着手**（2026-10-18 に技術スタック・ドメイン・ダッシュボード・デザインの方向性を決定）。フェーズ0（リポジトリ整理）から進める
> 目的: ホスティングを GitHub Pages から Vercel に移す。あわせて画面を洗練されたデザインに作り直し、絵文字をやめて Lucide のアイコンに置き換える。散らかったリポジトリも整理する。

---

## 1. 決定事項（2026-10-18）

| 項目 | 決定 |
|---|---|
| 技術スタック | **React + Vite**（TypeScript） |
| ドメイン | **`*.vercel.app` をそのまま使う**。独自ドメインは使わない |
| ダッシュボード | **作り直す**（5章） |
| デザインの方向性 | **落ち着いたニュートラル系**。ライト/ダークの両モードを持ち、シンプルでスタイリッシュに。ただし使いやすさは損なわない（4章） |
| 追加スコープ | **リポジトリのフォルダ・ファイルを整理する**（6章） |

---

## 2. 現状の整理

| 項目 | 現状 | 移行への影響 |
|---|---|---|
| 構成 | ビルドなしの素の HTML/JS が4ページ（`index.html` + `app.js` 約2,900行、`notify.html`、`admin.html`、`unsubscribe.html`） | ページの作り直しが作業の中心。最適化ロジックが `app.js` の UI コードと混ざっている |
| CSS | `style.css` 約2,200行 + `ai-styles.css`。iOS 風の青基調 | デザイントークンから作り直す |
| メニューデータ | Supabase の `menus` から取得 | 変更なし |
| AI 推奨データ | Supabase の `ai_selections` から取得 | 変更なし |
| `docs/ai-selections/*.json` | 2026-04-10 で更新が止まった旧形式のファイル。読んでいるのは動いていないダッシュボードだけ | 新フロントでは使わない。フェーズ7で削除 |
| 外部ライブラリ | `supabase-js` と `Chart.js` を CDN から読み込み | npm の依存に移す。Chart.js はやめる |
| 絵文字 | 見出し、タブ、ボタン、空状態の表示などで使用 | Lucide のアイコンに置き換える（8章） |

### GitHub Pages の URL が埋め込まれている箇所

| 箇所 | 内容 |
|---|---|
| `supabase/functions/send-daily-digest/index.ts:25` | `APP_BASE_URL` の既定値（メール内のリンク先） |
| `supabase/functions/unsubscribe/index.ts:17` | CORS の許可オリジンが `https://1onotakanori-art.github.io` で固定 |
| Supabase Auth の設定 | `notify` のマジックリンクの戻り先（Redirect URLs） |
| `README.md`、`docs/ADMIN_SETUP.md`、`UI_IMPROVEMENTS.md` | 公開 URL の記載 |

---

## 3. 技術スタック

| 役割 | 採用技術 | 理由 |
|---|---|---|
| フレームワーク | **Vite + React + TypeScript** | サーバー処理はすべて Supabase にあるので SSR は不要。Next.js より軽くて構成が単純 |
| 置き場所 | **`web/` ディレクトリ**（独自の `package.json`。Vercel の Root Directory を `web` にする） | ルートの `package.json` はスクレイパー用（CommonJS + Playwright）なので混ぜない |
| スタイル | **Tailwind CSS**（デザイントークンは CSS 変数で定義） | ライト/ダーク両対応のトークンを1か所で管理できる |
| アイコン | **lucide-react** | 絵文字の置き換え。線の太さとサイズを統一できる |
| グラフ | **Recharts** | React と相性が良く、トークンの色をそのまま使える。Chart.js はやめる |
| ページ構成 | マルチページ（`/`、`/dashboard`、`/notify`、`/admin`、`/unsubscribe`） | メールに載せたリンクの形を変えずに済む |
| ホスティング | **Vercel**（静的配信、GitHub 連携の自動デプロイ） | プレビューデプロイで PR ごとに見た目を確認できる |
| 設定値 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` の環境変数 | ソースへの直書きをやめる（anon キーは公開前提の値） |
| 共通ロジック | `supabase/functions/_shared/matchRules.js` を `web/` から import する | Edge Function と判定ロジックを共有したまま。Vercel の「Root Directory 外のファイルをビルドに含める」設定（既定で有効）を使う |
| テスト | `node:test`（既存の `npm test`） | 切り出したロジックに単体テストを付ける |

---

## 4. デザイン方針

**落ち着いたニュートラル系 / ライト・ダーク両対応 / シンプルでスタイリッシュ。ただし使いやすさが最優先。**

### 見た目

- **色**: 背景・面・線・文字はグレー系（Tailwind の `zinc` 程度の彩度の低いグレー）で組み立てる。アクセント色は1色だけにして、主ボタン・選択中のタブ・フォーカスにだけ使う
- **状態の色**: 推奨・固定・除外、目標との差（不足・超過）は、彩度を抑えた色で区別する。ライト/ダークでそれぞれ見やすい値をトークンとして定義する
- **ダークモード**: 既定は OS の設定に従う。ヘッダーに切り替え（ライト / ダーク / システム）を置き、選んだ値は端末に保存する
- **文字**: システムフォント（日本語は Hiragino / Noto Sans JP にフォールバック）。数値は `tabular-nums` で桁をそろえる
- **形**: 角丸は控えめに統一し、影はほぼ使わず線と面の濃淡で区切る

### 使いやすさで守ること

- 今の画面でできる操作は、すべて新しい画面でもできるようにする（操作の流れは変えない）
- タップできる部分は 44px 以上にする
- 文字と背景のコントラストは WCAG AA 以上（ライト・ダーク両方で確認）
- 推奨・固定・除外などの状態は、色だけでなくアイコンとラベルでも見分けられるようにする
- アイコンだけのボタンには必ずラベル（`aria-label`、必要なら文字も併記）を付ける
- iPhone の入力時の拡大防止（今は `user-scalable=no`）は、入力欄の文字サイズを 16px 以上にする方法に置き換え、ピンチでの拡大は使えるようにする
- モバイルでは主要タブを画面下部のタブバーにして、片手で操作しやすくする

---

## 5. ダッシュボード

### 旧ダッシュボードの調査結果

2026年1月に「Step 4E」として、メイン画面のタブの1つとして作られたもの。**AI 推奨の傾向を全期間で集計して見る画面**だった。

| 要素 | 内容 |
|---|---|
| 集計カード（4つ） | AI が推奨したメニューの総数、平均推奨スコア（%）、平均エネルギー（kcal）、平均たんぱく質（g） |
| スコア分布 | 推奨スコアのヒストグラム（10%刻み） |
| 日別の平均スコア | 日付ごとの平均推奨スコアの折れ線グラフ |
| PFC 比 | 推奨メニューのたんぱく質・脂質・炭水化物のカロリー比率（ドーナツグラフ） |
| よく推奨されるメニュー | 推奨回数の多い上位10メニュー（横棒グラフ） |
| エネルギー分布 | 推奨メニューのエネルギーのヒストグラム（100kcal 刻み） |
| たんぱく質分布 | 推奨メニューのたんぱく質のヒストグラム（5g 刻み） |
| 統計表 | スコア・エネルギー・たんぱく質・脂質・炭水化物の最小・平均・最大・標準偏差 |

データは `docs/ai-selections/*.json` を全日付分 fetch して、ブラウザで集計していた。

### 動いていない理由

1. **画面の部品が消えている**: 2026-02-02 のコミット `29af6bf`（「ダッシュボードを admin.html に移動」）で `index.html` からタブと部品が削除された。ところが `admin.html` 側には追加されておらず、どこにも表示されない
2. **データの形が合っていない**: コードは `recommendations` と英語のキー（`nutrition.energy` など）を読もうとしている。実際の JSON は `selectedMenus` と日本語のキー（`エネルギー` など）で、日付一覧もオブジェクトの配列になっている。部品を戻しても「データなし」になる
3. **データが古い**: JSON は 2026-04-10 で更新が止まっている。今の AI 推奨は Supabase の `ai_selections` にある

### 作り直し案

- **場所**: 独立したページ `/dashboard`。メイン画面のヘッダーからリンクする
- **データ**: Supabase の `ai_selections`（`selected_menus`）から読む。JSON ファイルは使わない
- **期間の切り替え**: 直近4週 / 直近3か月 / 全期間
- **内容**: 旧ダッシュボードの要素をベースにする。ヒストグラム3つは、タブで切り替える1枚にまとめて縦に長くなりすぎないようにする
- **集計ロジック**: 純粋な TS 関数として切り出し、単体テストを付ける
- **追加の候補（実装時に相談）**: `meal_history`（実際に選んだメニュー）と AI 推奨の一致率

---

## 6. リポジトリ整理

### 整理後のルート

```
.github/      GitHub Actions（Supabase keep-alive）
docs/         計画書・セットアップ手順
menus/        週次スクレイピングの結果（自動 push）
ml/           AI 推薦パイプライン（Python）
scripts/      スクレイピング・アップロード・週次処理の Node スクリプト、Windows のタスク
src/          スクレイパー本体（Playwright）と日付ユーティリティ
supabase/     Edge Functions・マイグレーション・テーブル定義 SQL
tests/        単体テスト
web/          新フロントエンド（Vite + React。Vercel の Root Directory）
CLAUDE.md  README.md  package.json  package-lock.json  requirements.txt  .nvmrc  .gitignore
```

### フェーズ0で行うこと（移行と関係なくすぐできるもの）

| 対象 | 処置 | 理由 |
|---|---|---|
| `scheduler.js`、`SCHEDULER_SETUP.md` | 削除 | PM2 で常駐させる旧方式。今は Windows のタスクスケジューラ（`scripts/windows/`）で動かしている |
| `e2e-test.js` | 削除 | 2026-02-02 の固定日付で admin の操作をまねる一回限りのスクリプト。どこからも呼ばれていない |
| `.github/copilot-instructions.md` | 削除 | 存在しない Express サーバーや `scrape.js` を説明していて古い。AI 向けの指示は `CLAUDE.md` に一本化する |
| `docs/GITHUB_TOKEN_SETUP.md` | 削除 | admin は 2026-03-30 に GitHub API から Supabase へ移行済み |
| `docs/FILE_INVENTORY.md` | 削除 | 2026-04-05 時点の棚卸し。今回の整理で役目を終える |
| `prescrap.js`、`scrape-and-upload.js`、`upload-to-supabase.js` | `scripts/` へ移動 | ルートを片付ける。`npm run` のスクリプト名は変えないので、Windows のタスクには影響しない |
| `docs/*.sql`（`AI_SELECTIONS_TABLE.sql` など3つ） | `supabase/schema/` へ移動 | Supabase のテーブル定義を1か所にまとめる |
| `package.json` の `express`、`node-cron` | 依存から削除 | `express` はどこからも使われていない。`node-cron` は `scheduler.js` だけが使っていた |
| ルートの `model/` | `ml/model/` に一本化（下記の不具合を直す） | 同じモデルファイルが2か所にある |
| `README.md`、`docs/QUICK_START.md`、`docs/ADMIN_SETUP.md`、`docs/AI_QUICK_START.md` | 現状に合わせて更新 | 移動・削除したファイルや GitHub トークンなど古い記載が残っている |

#### 整理中に見つけた不具合: 再学習したモデルが使われていない

- `ml/menu_recommender.py` の `save_model()` は、保存先が既定で「実行時のカレントディレクトリの `model/`」になっている。`npm run` から実行するとリポジトリのルートが基準になるので、ルートの `model/` に保存される
- 一方で AI 推奨を作る `ml/update_weekly.py` と `ml/generate_ai_selections.py` は `ml/model/` から読む
- その結果、AI 推奨には **2026-01-29 のモデルが使われ続けている**。週次の再学習（最新はルートの `model/` の 2026-09-24）は反映されていない
- 対応: 保存先を `ml/model/` に固定し、ルートの最新モデルを `ml/model/` に移す。**次の週次処理から AI 推奨の結果が変わる**ので、変更後に1回、推奨結果を確認する

### フェーズ7で行うこと（旧画面を止めるときに消すもの）

| 対象 | 理由 |
|---|---|
| `index.html`、`app.js`、`style.css`、`ai-styles.css`、`admin.html`、`admin.js`、`notify.html`、`notify/`、`unsubscribe.html` | `web/` に置き換わる |
| `.nojekyll` | GitHub Pages 用 |
| `UI_IMPROVEMENTS.md` | 旧画面の改修履歴（内容は git の履歴に残る） |
| `docs/ai-selections/` | 旧形式の JSON。新しいダッシュボードは Supabase から読む |
| `src/optimizer/optimizeMenus.js` | フェーズ2で `web/` の最適化モジュールに統合したあと |

---

## 7. 実装フェーズ（それぞれ別の PR）

| フェーズ | 内容 | 完了の目安 |
|---|---|---|
| **0. リポジトリ整理** | 6章の「フェーズ0で行うこと」。モデル保存先の不具合も直す | ルートが6章の形に近づき、`npm test` と週次処理のスクリプト（`npm run ml:dry-run`）が通る |
| **1. 土台づくり** | `web/` に Vite + React + TS の雛形、Tailwind、デザイントークン（ライト/ダーク）、テーマ切り替え。共通のレイアウト（ヘッダー、モバイルの下部タブバー）。`vercel.json` を追加 | Vercel のプレビューデプロイで、ライト/ダークを切り替えられる空のページが表示される |
| **2. ロジックの切り出し** | `app.js` の最適化（貪欲法、距離スコア）、栄養の集計、日付変換を純粋な TS モジュールに分ける。`src/optimizer/optimizeMenus.js` との違いを確認して1つにまとめる。`notify/ruleForm.js` は `web/` へ移し、テストの import 先を直す | 切り出したモジュールに単体テストがあり、既存テストも通る |
| **3. メイン画面の作り直し** | 設定・メニュー・結果・AI の4タブ | 今の画面でできる操作がすべて新しい画面でできる |
| **4. 通知・管理・配信停止ページの作り直し** | `notify`、`admin`、`unsubscribe` を同じデザインで作り直す | マジックリンクでのログイン、ルールの編集、配信停止が新しい画面で動く |
| **5. ダッシュボードの作り直し** | 5章の作り直し案 | `/dashboard` で期間を切り替えて集計とグラフが見られる |
| **6. Vercel への切り替え** | Vercel のプロジェクトを作って GitHub と連携。Supabase 側を更新する（下記）。`web/` と `supabase/functions/_shared/` に変更がない commit は `ignoreCommand` でデプロイを飛ばす（週次の `menus/` の自動 push でデプロイが走らないようにする） | 本番 URL（`*.vercel.app`）で全ページが動き、通知メールのリンク先が Vercel になっている |
| **7. GitHub Pages の停止と旧画面の削除** | 送信済みメールの配信停止リンクは github.io を向いているので、Pages の公開元を転送用ページだけを置いた `gh-pages` ブランチに切り替え、しばらく旧 URL を Vercel へ転送する。そのうえで `main` から旧画面のファイルを消す（6章）。README と docs を更新する | 旧 URL から新 URL へ転送され、`main` に旧画面のファイルと github.io の記載が残っていない |

絵文字から Lucide への置き換えは、フェーズ3〜5の中で進める（8章）。

### フェーズ6で更新する Supabase の設定

- Auth の Redirect URLs に Vercel のドメインを追加する
- Edge Function のシークレット `APP_BASE_URL` を Vercel のドメインに変更する
- `unsubscribe` の CORS 許可オリジンを環境変数で設定する形に変更する（移行期間中は github.io と Vercel の両方を許可）

---

## 8. 絵文字 → Lucide アイコンの対応表

| 今の絵文字 | 使っている場所 | Lucide アイコン |
|---|---|---|
| 🍽️ | ヘッダーのタイトル | `UtensilsCrossed` |
| 🔔 | メニュー通知へのリンク | `Bell` |
| ⚙️ | 設定タブ | `SlidersHorizontal` |
| 📋 | メニュータブ、メニュー選択の見出し | `ListChecks` |
| 📊 | 結果タブ、結果表示ボタン | `ChartColumn` |
| 🤖 | AI タブ | `Sparkles` |
| 📅 | 日付 | `CalendarDays` |
| 🔢 | 最大メニュー数 | `Hash` |
| 🎯 | 栄養目標 | `Target` |
| 🚀 | 最適化ボタン | `Wand2` |
| 🔄 | 再最適化ボタン | `RefreshCw` |
| ← | 設定に戻るボタン | `ArrowLeft` |
| 📈 | 栄養情報の見出し | `TrendingUp` |
| 📭 | データなしの表示 | `Inbox` |
| （新規） | ダッシュボードへのリンク | `LayoutDashboard` |
| （新規） | テーマ切り替え | `Sun` / `Moon` / `Monitor` |

上の表にない絵文字（`app.js` や `notify` が動的に出すものなど）は、実装時に洗い出して同じ方針で置き換える。

---

## 9. スコープ外（今回はやらない）

- 通知メール本文（HTML メール）の見た目の変更。メールでは React のアイコンが使えないため
- ML パイプラインと週次処理の変更（フェーズ0のモデル保存先の修正を除く）
- Supabase のテーブル構成の変更
- `ai_selections` と `meal_history` の RLS の見直し。今は anon キーで誰でも書き込める設定（`FOR ALL USING (true)`）になっている。移行とは別に対応する
