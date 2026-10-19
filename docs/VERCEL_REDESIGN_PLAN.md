# Vercel 移行 & 画面リデザイン — 実装計画

> ステータス: **フェーズ4実装済み**（2026-10-20）。フェーズ0〜3と RLS の見直し（PR #12、本番適用済み）は完了。次はフェーズ5（ダッシュボード）
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

### `web/` の構成（フェーズ1時点）

```
web/
  index.html, dashboard.html, notify.html, admin.html, unsubscribe.html   各ページの入口（Vite のマルチページ）
  public/theme-init.js     初回描画の前にテーマを決める（ちらつき防止。src/lib/theme.ts と同じロジック）
  src/styles/global.css    デザイントークン（ライト / ダーク）と Tailwind の設定
  src/lib/                 画面に依存しない処理（tests/web/ でテストする）
                             api.ts        Supabase からの読み込み（日付の一覧、メニュー、AI 推奨）
                             mappers.ts    Supabase の行を画面で使う形に直す（テストできるよう api.ts から分けている）
                             settings.ts   メイン画面の設定（栄養目標、追加の上限）の保存と復元
                             supabase.ts   Supabase の接続（anon キーは公開前提。環境変数で上書きできる）
                             date.ts       日付（日本時間の今日、"10/30(金)" の表示、初期表示の日付）
                             nutrition.ts  メニューと栄養値の型、合計、目標との差、E/P/F/C/V の定義
                             optimizer.ts  距離の計算と、貪欲法 + ローカルサーチの最適化
                             ruleForm.js   通知ルールのフォーム ⇔ 条件の変換（今の notify.html からも使うので JS のまま）
                             theme.ts      テーマの解決
  src/hooks/               React のフック（useTheme）
  src/components/          共通の部品（AppShell、TabBar、ThemeToggle、EmptyState、ui.tsx の小さな部品、Nutrition.tsx の栄養表示）
  src/components/main/     メイン画面の4つのタブ
  src/pages/               各ページの中身
  vercel.json              cleanUrls（/notify → notify.html）、前回のデプロイから web/ と supabase/functions/_shared/ が変わっていなければビルドしない
```

- 開発サーバーでも `/notify` のような拡張子なしの URL で開ける（`vite.config.ts` の `cleanUrls`）
- フェーズ1では、各ページは共通の枠と「準備中」の表示だけ。中身はフェーズ3〜5で作る

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
| `README.md`、`docs/ADMIN_SETUP.md`、`docs/AI_QUICK_START.md`、`docs/SUPABASE_SETUP.md`、`docs/WINDOWS11_MIGRATION.md` | 現状に合わせて更新 | 移動・削除したファイルや GitHub トークンなど古い記載が残っている |
| `docs/QUICK_START.md` | 削除（README に統合） | スクレイピングの手順だけで、README と重複していた |

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
| **0. リポジトリ整理**（完了） | 6章の「フェーズ0で行うこと」。モデル保存先の不具合も直す | ルートが6章の形に近づき、`npm test` と週次処理のスクリプト（`npm run ml:dry-run`）が通る |
| **1. 土台づくり**（実装済み。Vercel のプレビューは未確認） | `web/` に Vite + React + TS の雛形、Tailwind、デザイントークン（ライト/ダーク）、テーマ切り替え。共通のレイアウト（ヘッダー、モバイルの下部タブバー）。`vercel.json` を追加 | Vercel のプレビューデプロイで、ライト/ダークを切り替えられる空のページが表示される |
| **2. ロジックの切り出し**（実装済み） | `app.js` の最適化（貪欲法、距離スコア）、栄養の集計、日付変換を純粋な TS モジュールに分ける。`src/optimizer/optimizeMenus.js` との違いを確認して1つにまとめる。`notify/ruleForm.js` は `web/` へ移し、テストの import 先を直す | 切り出したモジュールに単体テストがあり、既存テストも通る |
| **3. メイン画面の作り直し**（実装済み） | 設定・メニュー・結果・AI の4タブ | 今の画面でできる操作がすべて新しい画面でできる |
| **4. 通知・管理・配信停止ページの作り直し**（実装済み。ログイン後の画面は Vercel 切り替え後に確認） | `notify`、`admin`、`unsubscribe` を同じデザインで作り直す | マジックリンクでのログイン、ルールの編集、配信停止が新しい画面で動く |
| **5. ダッシュボードの作り直し** | 5章の作り直し案 | `/dashboard` で期間を切り替えて集計とグラフが見られる |
| **6. Vercel への切り替え** | Vercel のプロジェクトを作って GitHub と連携。Supabase 側を更新する（下記）。前回のデプロイから `web/` と `supabase/functions/_shared/` が変わっていなければ `ignoreCommand` でデプロイを飛ばす（週次の `menus/` の自動 push でデプロイが走らないようにする） | 本番 URL（`*.vercel.app`）で全ページが動き、通知メールのリンク先が Vercel になっている |
| **7. GitHub Pages の停止と旧画面の削除** | 送信済みメールの配信停止リンクは github.io を向いているので、Pages の公開元を転送用ページだけを置いた `gh-pages` ブランチに切り替え、しばらく旧 URL を Vercel へ転送する。そのうえで `main` から旧画面のファイルを消す（6章）。README と docs を更新する | 旧 URL から新 URL へ転送され、`main` に旧画面のファイルと github.io の記載が残っていない |

絵文字から Lucide への置き換えは、フェーズ3〜5の中で進める（8章）。

### フェーズ2で決めたこと（2026-10-19）

- **最適化は「貪欲法 + ローカルサーチ」に一本化した**。今のサイト（`app.js`）は貪欲法だけだが、`src/optimizer/optimizeMenus.js` には同じ距離の計算でローカルサーチ（1品減らす・入れ替える・足す）まで入っていた。ローカルサーチは距離が小さくなる変更しか採用しないので、結果が悪くなることはない
  - 実データ（168日分 × 目標4通り × 上限2通り × 固定あり/なし = 2,688通り）で比べると、`src/optimizer` とは全件同じ組み合わせ、`app.js` とは 84% が同じで、残り 16% はより目標に近い組み合わせになった（悪くなったものは0件）
  - `src/optimizer` にあった「マルチスタート」は、毎回同じ計算を繰り返すだけで意味がなかったので入れていない
- **日付は ISO 形式（YYYY-MM-DD）で持つ**。今のサイトは "10/30(金)" の形から年を推測して戻しており、過去の日付が来年扱いになる。また `toISOString()`（UTC）で「今日」を作るため、日本時間の 0〜9 時は前日になり、初期表示の日付がずれることがあった。新しい実装は日本時間で「今日」を決める
- `notify/ruleForm.js` は `web/src/lib/ruleForm.js` に移した。今の `notify.html` からも読み込むため JS のまま（`web/` の TS から使うときは `allowJs` を有効にする）

### フェーズ3で決めたこと（2026-10-19）

- **操作の流れは今の画面と同じ**: 設定 → メニュー（押すと除外、スイッチで固定）→ 最適化 → 結果（外したいものを押して選び直す）。AI タブは別に見られる
- **言葉を変えたところ**: 「推奨 / 固定 / 除外」の「推奨」は、AI 推奨とまぎらわしいので表示しない（何も指定していない状態は無印）。「距離スコア」は「目標とのずれ（0 に近いほど目標どおり）」、「最大メニュー数」は「追加するメニューの上限（固定したメニューは数えません）」と書いた
- **足した機能**:
  - メニューの一覧に「AI 推奨」のバッジを出す
  - AI タブに「このセットを固定する」ボタンを付けた（AI のセットを固定してメニューのタブへ移る）
  - 目標ごとの状態を「目標どおり / 多い / 少ない」で示す。判定は最適化と同じ許容幅を使い、色だけでなくアイコンと文字でも示す
- **初期設定**: 初めて開いたときは5つの目標をすべて有効にする（今の画面は全部オフから始まり、最適化する前に設定が必要だった）。設定は端末に保存する
- **日付を変えたら**、固定・除外・結果はリセットする（メニューが日ごとに違うため）
- AI 推奨の番号は、セットの中での順番（1, 2, 3）を表示する。データの `rank` は全メニュー中の順位なので、並び順にだけ使う

### フェーズ4で決めたこと（2026-10-20）

- **ログイン**は通知・管理とも Supabase Auth のメールリンク。通知は初めてのメールアドレスでも登録する、管理画面は登録しない（今と同じ）。ログイン状態の受け取りとリンクの送信は `useSession.ts` と `Login.tsx` で共通にした
- **通知ページ**: 通知設定（受け取る・曜日）、ルールの一覧（オン・オフ、編集、削除、今後の該当日数）、ルールの編集（メニュー名・含まないキーワード・栄養値・アレルゲン・プレビュー）、最近の通知。判定は通知メールと同じ `_shared/matchRules.js` を使う
- **管理ページ**: 日付を選ぶとその日のメニューと保存済みの記録を自動で読む（「メニュー読込」ボタンはなくした）。食べたメニューを押して選び、星で評価して保存する。保存する行の形は今の管理画面と同じ（ML の学習データになるため）
  - 今の管理画面は保存のたびに localStorage にも控えを書いていたが、新しい画面は Supabase だけに保存する。「最近の記録」も localStorage ではなく Supabase から読む（端末をまたいでも同じものが出る）
- **配信停止ページ**: メールのリンク（`unsubscribe.html?token=…`）はそのまま使える（cleanUrls で `/unsubscribe` に転送され、クエリも残る）。押すまでは停止しない（今と同じ）
- ログイン後の画面は、ログインできないため開発中は本物のセッションでは確かめていない。メニューのデータ（誰でも読める）と仮のルールで部品を描画して、表示・プレビュー・保存される条件の形を確認した

### Vercel のプロジェクト（2026-10-19 作成）

| 項目 | 値 |
|---|---|
| チーム | takanori's projects（Hobby） |
| プロジェクト | `kyowa-menu-optimizer`（`prj_bNwfSyRJRF6BkDv7nBb7PZrXGkOl`） |
| Root Directory / Framework | `web` / Vite |
| 本番の URL | `https://kyowa-menu-optimizer-takanoris-projects-ff756f89.vercel.app` |

- プロジェクトの作成と設定の変更はダッシュボードで行う（Vercel の MCP の接続には、作成・更新の権限がない）
- **Deployment Protection（Vercel Authentication）が「本番の `*.vercel.app` を含めて有効」になっている**。このままだと、Vercel にログインしていない人は本番の URL も開けない。フェーズ6で公開するときに、保護の対象をプレビューだけにする（Settings → Deployment Protection）
- 本番の URL が長いので、フェーズ6で短い `*.vercel.app` の名前（例: `kyowa-menu.vercel.app`）が空いていれば割り当てる

### フェーズ6で更新する Supabase の設定

- Auth の Redirect URLs に Vercel のドメインを追加する（例: `https://kyowa-menu-optimizer-takanoris-projects-ff756f89.vercel.app/**`。プレビューでもログインを試すなら `https://kyowa-menu-optimizer-*-takanoris-projects-ff756f89.vercel.app/**` も）
- Edge Function のシークレット `APP_BASE_URL` を Vercel のドメインに変更する
- `unsubscribe` を再デプロイする。CORS の許可元はフェーズ4で `_shared/cors.js` の一覧（github.io・Vercel の本番・このプロジェクトのプレビュー）に変えてあり、環境変数 `ALLOWED_ORIGINS` で上書きできる。再デプロイするまで、Vercel のページからの配信停止はブラウザに止められる

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
- `ai_selections` と `meal_history` の RLS の見直し。今は anon キーで誰でも書き込める設定（`FOR ALL USING (true)`）になっている。移行とは別に対応する（[PR #12](https://github.com/1onotakanori-art/kyowa-menu-optimizer/pull/12)。10章）

---

## 10. マージの進め方

並行して進んでいる PR と、このあとのフェーズの PR を、次の順で main に入れる。

| 順 | PR | 前提・やること |
|---|---|---|
| 1 | **フェーズ0（リポジトリ整理・モデル保存先の修正）** | DB に関係なく、単独でマージできる。先に入れて、ほかの PR はこの上に載せ直す |
| 2 | **[PR #12](https://github.com/1onotakanori-art/kyowa-menu-optimizer/pull/12)（RLS の見直し）**（2026-10-19 にマージ・本番適用済み） | フェーズ0のマージ後に main へ rebase する（`docs/*.sql` の移動と `docs/ADMIN_SETUP.md` の書き直しが重なる）。本番への反映は下の順で行う |
| 3 | **フェーズ1〜** | PR #12 のマージ後に main から切る。フェーズ4で `admin` を作り直すときは、PR #12 で入るメールリンクのログインと管理者の判定を引き継ぐ |

### PR #12 を本番に反映する順番

PR #12 のコードは、管理者の権限（`app_metadata.role = 'admin'`）がないアカウントには管理画面を表示しない。そのため、**権限の付与をコードのマージより先に**行う。

1. Supabase の Redirect URLs に `admin.html` の URL が含まれているか確認する
2. 管理者にするアカウントに `role = 'admin'` を付ける（`docs/RLS_REVIEW.md` の SQL）。今のポリシーのままでも害はない
3. PR #12 をマージし、`admin.html` でログインして記録の読み込みと保存ができることを確認する
4. 週次処理を動かす PC に `SUPABASE_SERVICE_KEY` があることを確認する（スクレイピングですでに必要なので、設定済みのはず）
5. マイグレーションを適用し、`docs/RLS_REVIEW.md` の確認項目を一通り見る

### 週次処理との関係

- 週次処理（毎週日曜 6:00 / 8:00）は main のチェックアウトで動く。`npm run menus:push` が `git pull --rebase --autostash` を行うので、マージした内容は次の週次処理の途中から自動で反映される
- フェーズ0で npm のスクリプトの中身（実行するファイルの場所）は変わるが、スクリプト名は変えていないので、タスクスケジューラの設定はそのままでよい
- マージは週次処理と重ならない時間（日曜の朝を避ける）に行う

