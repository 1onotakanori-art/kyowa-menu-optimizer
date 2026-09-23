# 📧 ユーザー登録 & 朝のメニュー通知メール — 実装計画

> ステータス: **計画段階（未実装）**
> 目的: ユーザーが登録した条件（特定メニュー / 特定ワード / 栄養・アレルゲン条件）に当日のメニューが該当した場合、その日の朝にメールで知らせる。

---

## 1. 現状の整理

| 項目 | 現状 | 本機能への影響 |
|---|---|---|
| ホスティング | GitHub Pages（静的サイト） | サーバー処理は外部（Supabase）に置く必要がある |
| DB | Supabase `menus`（`date`, `menu_name`, `nutrition` JSONB） | 当日メニューはここから引ける。栄養値・アレルゲン（◯/－）も JSONB 内にある |
| データ更新 | 週次スクレイピング（約10日先まで） | 当日朝の時点でデータは揃っている。祝日など休みの日はデータがない |
| 認証 | 管理画面は固定パスワードのみ | ユーザー認証の仕組みを新しく入れる必要がある |
| RLS | `meal_history` は匿名書き込み可 | 新しいテーブルは必ずユーザー単位の RLS にする |

---

## 2. 推奨技術スタック

「サーバーを持たない」という今の方針を維持し、**Supabase にすべて寄せる**構成を推奨します。

| 役割 | 採用技術 | 理由 |
|---|---|---|
| ユーザー登録・ログイン | **Supabase Auth（メールのマジックリンク / OTP）** | パスワード管理が不要。静的サイトから `supabase-js` だけで使える。無料枠で十分 |
| 条件・送信履歴の保存 | **Supabase Postgres + RLS** | 既存DBをそのまま使える。`auth.uid()` でユーザーごとにデータを分離できる |
| 判定と送信処理 | **Supabase Edge Function（Deno / TypeScript）** | service_role キーをブラウザに出さずに全ユーザー分を処理できる |
| 朝の定時実行 | **pg_cron + pg_net**（Edge Function を呼ぶ） | 時刻の精度が高い。GitHub Actions の cron は数十分遅れたりスキップされたりすることがある |
| メール送信 | **Resend**（無料枠: 3,000通/月・100通/日） | API がシンプルでバッチ送信にも対応。Auth 用の SMTP としても使える |
| 設定UI | 既存と同じく素の HTML/JS（新ページ `notify.html`） | ビルド工程なし。今のコードベースに合わせる |
| テスト | `node:test`（Node 標準） | 依存を増やさずに判定ロジックの単体テストが書ける |

### 検討した代替案

| 案 | 評価 |
|---|---|
| GitHub Actions の cron + Node スクリプト（nodemailer / Resend） | Node で統一できるのは利点。ただし cron が 5〜30分以上遅れることがあり、「朝」の保証が弱い。**フォールバックとしては有効** |
| Win11 常時起動PCのタスクスケジューラ | 既存の仕組みに乗れるが、PC停止がそのまま単一障害点になる。非推奨 |
| SendGrid / AWS SES | SES は安いが初期設定（サンドボックス解除）が重い。規模が小さいうちは Resend が手軽 |
| Gmail SMTP | 送信制限・到達率・規約の面で本番用途には不向き |

---

## 3. 全体アーキテクチャ

```
[ユーザー] ──(マジックリンク)──> Supabase Auth
    │
    └─ notify.html（GitHub Pages）
         ├─ ルールの作成・編集（RLS: 本人の行のみ）
         └─ プレビュー: 直近のメニューで何件ヒットするかをブラウザで試算
                         ↑ 共通の判定モジュール matchRules.js

毎朝 07:00 JST
pg_cron ──(pg_net HTTP POST)──> Edge Function `send-daily-digest`
    1. menus から当日分を取得（0件なら休業日として終了）
    2. 有効なユーザーとルールを取得
    3. matchRules.js で判定（Edge Function と同じ共通モジュール）
    4. ヒットしたユーザーごとに1通にまとめて Resend のバッチAPIで送信
    5. notification_deliveries に記録（二重送信の防止）
```

### 判定ロジックの共通化

`supabase/functions/_shared/matchRules.js` を **依存のない ES Module** として書き、次の3か所から同じファイルを import します。

- Edge Function（Deno）
- `notify.html` のプレビュー（GitHub Pages はリポジトリ直下を配信するので、そのまま `<script type="module">` で読める）
- Node の単体テスト（`node --test`）

これで「プレビューではヒットしたのにメールが来ない」というズレを防ぎます。

---

## 4. データモデル（案）

```sql
-- ユーザーごとの通知設定
create table profiles (
  user_id           uuid primary key references auth.users on delete cascade,
  display_name      text,
  email_enabled     boolean not null default true,
  notify_weekdays   int[]   not null default '{1,2,3,4,5}',  -- ISO曜日（1=月）
  unsubscribe_token uuid    not null default gen_random_uuid(),
  created_at        timestamptz default now()
);

-- 通知ルール（1ユーザーが複数持てる。ルール同士は OR 結合）
create table notification_rules (
  id          bigserial primary key,
  user_id     uuid not null references auth.users on delete cascade,
  name        text not null,                 -- 例: 「カレーの日」
  enabled     boolean not null default true,
  conditions  jsonb not null,                -- 下記のDSL
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- 送信履歴（冪等性の担保と監査用）
create table notification_deliveries (
  id           bigserial primary key,
  user_id      uuid not null references auth.users on delete cascade,
  menu_date    date not null,
  status       text not null,                -- sent / skipped / failed
  matched      jsonb,                        -- ヒットしたルールとメニュー
  provider_id  text,                         -- Resend の message id
  error        text,
  created_at   timestamptz default now(),
  unique (user_id, menu_date)                -- 同じ日に2通送らない
);
```

RLS の方針:
- `profiles` と `notification_rules`: `user_id = auth.uid()` の行だけ SELECT / INSERT / UPDATE / DELETE できる
- `notification_deliveries`: 本人は SELECT のみ。書き込みは service_role（Edge Function）だけ
- 新規ユーザー作成時に trigger で `profiles` を自動作成する

### 条件DSL（`conditions` JSONB）

UI には3種類のテンプレートを出しますが、内部ではすべて同じDSLで表現します。

```jsonc
// ① 特定メニュー（完全一致）
{ "all": [ { "field": "name", "op": "equals", "value": "モチコチキン" } ] }

// ② 特定ワードを含む（いずれか）
{ "all": [ { "field": "name", "op": "contains_any", "value": ["カレー", "唐揚げ"] } ] }

// ③ 条件を満たすメニュー（AND）
{ "all": [
    { "field": "たんぱく質", "op": ">=", "value": 20 },
    { "field": "エネルギー", "op": "<=", "value": 500 },
    { "field": "allergen",   "op": "excludes", "value": ["海老", "カニ"] },
    { "field": "name",       "op": "not_contains_any", "value": ["揚げ"] }
] }
```

- `field` には `name`、`nutrition` のキー（エネルギー / たんぱく質 / 脂質 / 炭水化物 / 飽和脂肪酸 / 食塩相当量 / 野菜重量）、`allergen` を指定する
- `op` の候補: `equals` / `contains_any` / `not_contains_any` / `>=` / `<=` / `excludes`
- 文字列比較の前に **NFKC正規化＋ひらがなとカタカナの同一視** を行う（「カレー」「ｶﾚｰ」「かれー」をすべて同じ扱いにする）
- 当初は `all`（AND）の1階層だけ。`any` のネストは要望が出てから追加する

---

## 5. メール仕様

- **送信時刻**: 平日 07:00 JST（pg_cron では `0 22 * * 0-4` UTC）。当日の `menus` が0件なら送らない（祝日・休業日の自動スキップ）
- **件名例**: `【協和食堂】今日は「カレーの日」に該当するメニューがあります（3件）`
- **本文**: ルールごとにヒットしたメニュー名と主要栄養値（E/P/F/C）を並べ、アプリへのリンク（`index.html?date=YYYY-MM-DD`）を付ける
- **まとめ方**: 1ユーザーにつき1日1通（複数ルールのヒットも1通にまとめる）
- **配信停止**: 本文に `unsubscribe_token` 付きの配信停止リンクを入れ、`List-Unsubscribe` と `List-Unsubscribe-Post` ヘッダ（ワンクリック停止）も付ける
- **法令面**: オプトイン（本人の登録操作）、送信者の表示、配信停止手段の明示（特定電子メール法）を満たす

---

## 6. 実装フェーズ

| Phase | 内容 | 成果物 |
|---|---|---|
| 0. 準備 | Resend アカウントを作り、送信ドメインを認証（SPF / DKIM）。Supabase で pg_cron と pg_net を有効化。Auth の SMTP を Resend に切り替え | 設定手順書 |
| 1. DB | 上記3テーブル、RLS、profiles 自動作成の trigger | `supabase/migrations/*.sql` |
| 2. 判定ロジック | `matchRules.js`（正規化を含む）と単体テスト。過去の `menus/*.json` を使ったテストも作る | `_shared/matchRules.js`, `tests/` |
| 3. 認証とUI | `notify.html`: ログイン、ルールの一覧・作成・編集・削除、テンプレート3種、直近2週間のヒット数プレビュー | `notify.html`, `notify.js` |
| 4. 送信 | Edge Function `send-daily-digest`（`?dry_run=1` と `?date=` で過去日の再現に対応）、メールテンプレート、配信停止用 Function | `supabase/functions/*` |
| 5. スケジュール・運用 | pg_cron の登録、失敗時に管理者へ通知、`notification_deliveries` による監視 | migration, ドキュメント |
| 6. 段階リリース | まず自分だけに dry-run → 自分宛てに本送信 → 他ユーザーへ公開 | — |

各フェーズは独立してレビューできる大きさに分け、1フェーズを1PRにする想定です。

---

## 7. リスクと対策

| リスク | 対策 |
|---|---|
| Supabase 標準の SMTP は1時間あたり数通までしか送れず、登録メールが届かない | Phase 0 で Auth の SMTP を Resend に切り替える |
| Resend は独自ドメインを認証しないと自分宛てにしか送れない | 送信ドメインが必要（持っていない場合は取得するか、当面は自分宛てのみで運用） |
| スクレイピングが失敗して当日データがない | 0件ならスキップし、平日なのに0件のときは管理者にアラートを送る |
| 二重送信（リトライ、cron の重複起動） | `unique(user_id, menu_date)` で送信前に行を確保する |
| service_role キーの漏えい | Edge Function の Secrets にだけ置き、フロントでは anon キーと RLS を使う |
| Supabase 無料プランは7日間アクセスがないと一時停止する | 毎朝の cron 実行と週次アップロードでアクセスが発生するので実質問題なし |

---

## 8. スコープ外（今回はやらない）

- 既存の管理画面（固定パスワード）と `meal_history` の RLS の見直し（**別途対応を推奨**。本機能で Auth が入れば管理者判定に流用できる）
- LINE / Slack / Web Push など、メール以外の通知チャネル
- 「数日前に予告」などの事前通知（DSLと送信日を分けておけば後から追加しやすい）

---

## 9. 着手前に決めたいこと

1. **利用者の範囲**: 自分だけ / 社内の同僚 / 一般公開 → 登録制限（メールドメインの許可リストなど）の要否が変わる
2. **送信ドメイン**: 独自ドメインを持っているか（Resend で本運用するには必須）
3. **送信時刻**: 07:00 JST でよいか（ユーザーごとに時刻を選べるようにするか）
4. **ヒットがない日**: 送らない（推奨）か、「該当なし」を送るか
