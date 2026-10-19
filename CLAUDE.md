# CLAUDE.md

## 用語・表記

- 「kyowa」は **共和**（共和食堂）。「協和」と書かないこと。

## 開発

- 単体テスト: `npm test`（`tests/**/*.test.mjs` を node:test で実行。Node 24 なので `web/src/lib/*.ts` も直接 import できる）
- 新フロントエンド: `web/`（Vite + React + TypeScript + Tailwind CSS）。`npm --prefix web run dev` / `npm --prefix web run build`
  - 色は `web/src/styles/global.css` のデザイントークンを使う（`bg-surface`、`text-fg-muted`、`text-accent` など）。色を直書きしない
  - アイコンは lucide-react を使い、絵文字は使わない。アイコンだけのボタンには `aria-label` を付ける
- Vercel 移行と画面リデザインの計画と進捗: `docs/VERCEL_REDESIGN_PLAN.md`
- メニュー通知機能の計画と進捗: `docs/EMAIL_NOTIFICATION_PLAN.md`
