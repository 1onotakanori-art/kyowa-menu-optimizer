# Windows 11 移行ガイド（現状維持）

このドキュメントは、現在の運用フロー（スクレイピング + Supabaseアップロード + ML週次更新）をそのまま Windows 11 常時稼働PCへ移行するための手順です。

## ゴール

- GitHub から clone しただけで、同じコマンド体系で動く
- `npm run weekly` で現行同等の一括処理を実行できる
- Windows タスクスケジューラで週次自動実行できる

## 0. 前提

- Windows 11
- Git インストール済み
- Node.js 20系 推奨（npm 同梱）
- Python 3.10+（`py` ランチャーまたは `python`）
- GitHub push 権限（PAT または SSH）

## 1. clone

```powershell
git clone https://github.com/1onotakanori-art/kyowa-menu-optimizer.git
cd kyowa-menu-optimizer
```

## 2. セットアップ（依存インストール）

```powershell
npm run setup:win11
```

このコマンドで以下を実行します。

- `.venv` 作成（未作成時）
- Python依存インストール（`requirements.txt`）
- Node依存インストール（`npm ci`）
- Playwright Chromium インストール

## 初回チェックコマンド（最短版）

Win11 側で clone 直後に、以下を上から順に実行してください。

```powershell
# 1) リポジトリ取得
git clone https://github.com/1onotakanori-art/kyowa-menu-optimizer.git
cd kyowa-menu-optimizer

# 2) 依存セットアップ
npm run setup:win11

# 3) 実行環境の即時確認
node -v
npm -v
.\.venv\Scripts\python.exe --version

# 4) 週次パイプラインの手動確認
npm run weekly

# 5) 自動実行登録
npm run task:register:win11

# 6) タスク登録状態の確認
schtasks /Query /TN KyowaMenuWeekly /V /FO LIST
```

補足:

- `npm run weekly` の前に `SUPABASE_SERVICE_KEY`（必要なら `ANTHROPIC_API_KEY`）を設定してください。
- まずは手動で 1 回成功させてから、Task Scheduler の常時運用に移行するのが安全です。

## 3. 環境変数の設定

最低限、以下を Windows 側で設定してください（ユーザー環境変数 or タスク側で指定）。

- `SUPABASE_SERVICE_KEY`
- （必要に応じて）`ANTHROPIC_API_KEY`
- （必要に応じて）`SUPABASE_URL`

PowerShell セッションで一時設定する例:

```powershell
$env:SUPABASE_SERVICE_KEY = "<your_service_key>"
$env:ANTHROPIC_API_KEY = "<your_anthropic_key>"
```

## 4. 手動で一度実行して確認

```powershell
npm run weekly
```

期待結果:

- `menus/` に最新 JSON が生成/更新される
- Supabase 反映処理が走る
- ML 週次更新が走る

## 5. 週次自動実行の登録

```powershell
npm run task:register:win11
```

デフォルト設定:

- タスク名: `KyowaMenuWeekly`
- 実行日: 月曜
- 実行時刻: 05:00

カスタム時刻で登録する場合:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/windows/register-tasks.ps1 -TaskName KyowaMenuWeekly -Day MON -StartTime 06:30
```

## 6. 運用確認

```powershell
schtasks /Query /TN KyowaMenuWeekly /V /FO LIST
schtasks /Run /TN KyowaMenuWeekly
```

ログ:

- `logs/weekly-task.log`

## 実装上の移行ポイント

- `package.json` の Python 実行は `.venv/bin/python3` 固定を廃止
- `scripts/run-python.js` が OS 別に Python 実行パスを自動解決
  - Windows: `.venv\\Scripts\\python.exe`
  - macOS/Linux: `.venv/bin/python3`（または `.venv/bin/python`）
- そのため、既存の `npm run ml:*` / `npm run weekly` は OS を問わず同一コマンドで運用可能

## Copilot 向け指示（Win11 clone 側）

Windows 側で GitHub Copilot に作業継続させるときは、最初に以下を渡してください。

```text
このリポジトリは docs/WINDOWS11_MIGRATION.md の手順で Win11 移行済みです。
まず docs/WINDOWS11_MIGRATION.md と .github/copilot-instructions.md を読んで、
現状の運用（npm run weekly + Task Scheduler）を崩さない範囲でセットアップ確認を進めてください。
```

## トラブルシューティング

### `python` が見つからない

- `py -3 --version` で確認
- Python を再インストールし、`Add python.exe to PATH` を有効化

### `npx playwright install chromium` で失敗

- プロキシ配下ではネットワーク許可設定を確認
- 再実行: `npx playwright install chromium`

### Task Scheduler で実行されない

- タスクの「最上位の特権で実行」を有効にする
- 実行ユーザーに対象リポジトリへの権限があるか確認
- 手動実行で再現するか先に確認: `npm run weekly`
