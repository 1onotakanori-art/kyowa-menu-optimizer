# Vercel 移行 & 画面リデザイン — 実装計画

> ステータス: **計画中**（未着手）。「6. 着手前に決めたいこと」が決まり次第、フェーズ1から進める
> 目的: ホスティングを GitHub Pages から Vercel に移す。あわせて画面を洗練されたデザインに作り直し、絵文字をやめて Lucide のアイコンに置き換える。

---

## 1. 現状の整理

| 項目 | 現状 | 移行への影響 |
|---|---|---|
| 構成 | ビルドなしの素の HTML/JS が4ページ（`index.html` + `app.js` 約2,900行、`notify.html`、`admin.html`、`unsubscribe.html`） | ページの作り直しが作業の中心。最適化ロジックが `app.js` の UI コードと混ざっている |
| CSS | `style.css` 約2,200行 + `ai-styles.css`。iOS 風の青基調 | デザイントークンから作り直す |
| メニューデータ | Supabase の `menus` から取得 | 変更なし |
| AI 推奨データ | `docs/ai-selections/*.json` を相対パスで fetch | ビルド成果物に同じパスで含める必要がある |
| 外部ライブラリ | `supabase-js` と `Chart.js` を CDN から読み込み | npm の依存に移す。Chart.js はダッシュボードでしか使っていない |
| ダッシュボード | `initDashboard()` の呼び出しがコメントアウトされており動いていない | 削除するか作り直すかを決める（6章） |
| 絵文字 | 見出し、タブ、ボタン、空状態の表示などで使用 | Lucide のアイコンに置き換える（4章） |

### GitHub Pages の URL が埋め込まれている箇所

| 箇所 | 内容 |
|---|---|
| `supabase/functions/send-daily-digest/index.ts:25` | `APP_BASE_URL` の既定値（メール内のリンク先） |
| `supabase/functions/unsubscribe/index.ts:17` | CORS の許可オリジンが `https://1onotakanori-art.github.io` で固定 |
| Supabase Auth の設定 | `notify` のマジックリンクの戻り先（Redirect URLs） |
| `README.md`、`docs/ADMIN_SETUP.md`、`UI_IMPROVEMENTS.md` | 公開 URL の記載 |

---

## 2. 推奨技術スタック

| 役割 | 採用技術 | 理由 |
|---|---|---|
| フレームワーク | **Vite + React + TypeScript** | サーバー処理はすべて Supabase にあるので SSR は不要。Next.js より軽くて構成が単純 |
| スタイル | **Tailwind CSS**（デザイントークンは CSS 変数で定義） | ライト/ダーク両対応のトークンを1か所で管理できる |
| アイコン | **lucide-react** | 絵文字の置き換え。線の太さとサイズを統一できる |
| ページ構成 | マルチページ（`/`、`/notify`、`/admin`、`/unsubscribe`） | メールに載せたリンクの形を変えずに済む |
| ホスティング | **Vercel**（静的配信、GitHub 連携の自動デプロイ） | プレビューデプロイで PR ごとに見た目を確認できる |
| 設定値 | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` の環境変数 | ソースへの直書きをやめる（anon キーは公開前提の値） |
| テスト | `node:test`（既存の `npm test`） | 切り出したロジックに単体テストを付ける |

### 検討した代替案

| 案 | 評価 |
|---|---|
| 素の JS のまま、Lucide の静的版（`lucide` パッケージ / SVG）を使う | 作業量は最も少ない。ただし 2,900行の `app.js` の見通しは良くならず、デザインの作り直しもやりにくい |
| Next.js | Vercel との相性は良いが、SSR・API ルートを使う予定がなく、この規模には重い |

---

## 3. 実装フェーズ（それぞれ別の PR）

| フェーズ | 内容 | 完了の目安 |
|---|---|---|
| **1. 土台づくり** | Vite + React + TS の雛形、Tailwind、デザイントークン（色・余白・角丸・影、ライト/ダーク）。`vercel.json` を追加。`docs/ai-selections/` はパスを変えずにビルド成果物へコピーする（Python 側は変更しない） | Vercel のプレビューデプロイで空のページが表示される |
| **2. ロジックの切り出し** | `app.js` の最適化（貪欲法、距離スコア）、栄養の集計、日付変換を純粋な TS モジュールに分ける。通知まわりは既存の `matchRules.js` と `ruleForm.js` をそのまま使う | 切り出したモジュールに単体テストがあり、既存テストも通る |
| **3. メイン画面の作り直し** | 設定・メニュー・結果・AI の4タブ。モバイルを主に作り、タブはモバイルでは下部のタブバーにする案。メニュー行の推奨・固定・除外は、色だけでなくアイコンとラベルでも見分けられるようにする | 今の画面でできる操作がすべて新しい画面でできる |
| **4. 通知・管理・配信停止ページの作り直し** | `notify`、`admin`、`unsubscribe` を同じデザインで作り直す | マジックリンクでのログイン、ルールの編集、配信停止が新しい画面で動く |
| **5. 絵文字を Lucide に置き換え** | フェーズ3・4の中で進める（4章の対応表） | 画面上に絵文字が残っていない |
| **6. Vercel への切り替え** | Vercel のプロジェクトを作って GitHub と連携。Supabase 側を更新する（下記）。`menus/` だけが変わった commit は `ignoreCommand` でデプロイを飛ばす（フロントは `menus/` を読んでいないため） | 本番 URL で全ページが動き、通知メールのリンク先が Vercel になっている |
| **7. GitHub Pages の停止** | 送信済みメールの配信停止リンクは github.io を向いているので、しばらくは旧 URL を Vercel へ転送するページとして残し、その後 Pages を止める。README と docs を更新する | 旧 URL から新 URL へ転送され、docs に github.io の記載が残っていない |

### フェーズ6で更新する Supabase の設定

- Auth の Redirect URLs に Vercel のドメインを追加する
- Edge Function のシークレット `APP_BASE_URL` を Vercel のドメインに変更する
- `unsubscribe` の CORS 許可オリジンを環境変数で設定する形に変更する（移行期間中は github.io と Vercel の両方を許可）

---

## 4. 絵文字 → Lucide アイコンの対応表

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

上の表にない絵文字（`app.js` や `notify` が動的に出すものなど）は、実装時に洗い出して同じ方針で置き換える。

---

## 5. スコープ外（今回はやらない）

- 通知メール本文（HTML メール）の見た目の変更。メールでは React のアイコンが使えないため
- ML パイプラインと週次処理（`ml/`、`scripts/`）の変更
- Supabase のテーブル構成の変更

---

## 6. 着手前に決めたいこと

1. **技術スタック**: React + Vite で進めるか、素の JS のまま Lucide の静的版を使う軽い改修にするか
2. **ドメイン**: `*.vercel.app` のままにするか、独自ドメインを使うか
3. **ダッシュボード**: 動いていない Chart.js のダッシュボードを削除するか、作り直すか
4. **デザインの方向性**: 今の iOS 風の青基調から、落ち着いたニュートラル系、食堂らしい温かみのある色など、どの方向にするか
