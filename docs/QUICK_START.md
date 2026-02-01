# 実行方法クイックガイド

このドキュメントでは、2つのスクリプトの実行方法を簡潔に説明します。

## 準備

### SSH キーの設定（初回のみ）

```bash
# GitHub との接続テスト
ssh -T git@github.com
```

成功すれば OK です。失敗した場合は [DATA_SYNC_GUIDE.md](DATA_SYNC_GUIDE.md) の「事前準備」を参照してください。

---

## ① 学習用データ同期

**目的:** GitHub の食事履歴データをローカルに同期

```bash
npm run sync
```

**何が起こる？**
- `kyowa-menu-history` リポジトリを clone/pull
- `docs/ai-selections/` に保存
- 更新されたデータのみダウンロード

**実行タイミング:**
- 管理者ページでメニューを記録した後
- 推奨: 毎日1回

---

## ② メニュースクレイプ & アップロード

**目的:** メニューをスクレイピングして GitHub にアップロード

```bash
# 5日分（デフォルト）
npm run scrape

# 10日分
npm run scrape:10

# 20日分
npm run scrape:20
```

**何が起こる？**
- `kyowa-menu-history` リポジトリを clone/pull
- Kyowa のサイトからメニュー取得
- `menus/` に保存
- リポジトリと比較して更新があれば commit & push

**実行タイミング:**
- メニューが更新されたとき
- 推奨: 週に1回（月曜日など）

---

## エラーが出た場合

### "リポジトリのクローンに失敗しました"

SSH キーが設定されていない可能性があります。

```bash
# 接続テスト
ssh -T git@github.com
```

### "日付が見つかりません"

サイトにメニューが登録されていない可能性があります。翌日再実行してください。

---

## スクリプトの詳細を知りたい場合

[docs/DATA_SYNC_GUIDE.md](DATA_SYNC_GUIDE.md) を参照してください。
