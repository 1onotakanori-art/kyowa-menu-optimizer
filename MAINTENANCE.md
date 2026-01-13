# メニュー更新手順（ローカル実行）

## 🔄 週1回の更新方法

このプロジェクトはメニューをローカルで取得して、手動で GitHub に保存します。

### ステップ 1: ターミナルを開く

Mac の場合、Spotlight（Command + Space）で "Terminal" を検索して開く。

### ステップ 2: プロジェクトフォルダに移動

```bash
cd /Users/onotakanori/kyowa-menu-optimizer
```

### ステップ 3: メニューをスクレイピング

```bash
node prescrap.js
```

実行結果：
```
🔥 メニュープリスクレイピング開始 (10日間)
...
✅ メニュー保存: menus_2026-01-14.json
...
📊 プリスクレイピング完了
   成功: 8, 失敗: 2
   保存日付: 1/14(水), 1/15(木), ...
```

✅ 出力に **「成功」** と表示されたら OK

### ステップ 4: GitHub に保存（Git コマンド）

```bash
# 1. 変更を確認
git status

# 2. メニューファイルを追加
git add docs/menus/ docs/available-dates.json

# 3. コミット（保存）
git commit -m "Update: Weekly menus for $(date '+%Y-%m-%d')"

# 4. GitHub にアップロード
git push origin main
```

**例：**
```bash
git add docs/menus/ docs/available-dates.json
git commit -m "Update: Weekly menus for 2026-01-13"
git push origin main
```

### ✅ 完了！

以下にアクセスして、メニューが更新されたか確認：
```
https://1onotakanori-art.github.io/kyowa-menu-optimizer/
```

---

## 📋 自動更新ではなく手動の理由

Kyowa のメニューサイトの JavaScript 処理が複雑で、GitHub Actions 環境（ヘッドレスブラウザ）ではメニュー取得に失敗するため、ローカルで実行してから手動で保存しています。

---

## ⚠️ よくあるエラーと対処

### エラー 1: `node: command not found`

**解決：** Node.js がインストールされていません。

```bash
# インストール確認
node --version
npm --version
```

表示されない場合、[Node.js 公式サイト](https://nodejs.org/) からインストール。

### エラー 2: `git: command not found`

**解決：** Git がインストールされていません。

```bash
# インストール確認
git --version
```

### エラー 3: メニューが 0 個のままで進まない

**解決：** サイトが一時的に利用不可の可能性があります。

```bash
# 少し待ってから再度実行
sleep 30
node prescrap.js
```

---

## 💡 Tips

- **時間がかかる場合：** `node prescrap.js` は 1 週間分で約 1-2 分かかります
- **特定の日付のみ取得：** `prescrap.js` を編集して `dateLabels` 配列を変更

---

**質問や問題があれば、このドキュメントを更新します！**
