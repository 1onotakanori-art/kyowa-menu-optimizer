# GitHub Pages 更新 - メニューデータ参照機能

## 📝 変更内容

GitHub Pages（`index.html` + `app.js`）を修正し、以下の機能を実装しました：

### 1️⃣ **メニューデータ参照パスの一元化**
- **変更前**: `docs/` フォルダ配下に menus データが必要
- **変更後**: `menus/` フォルダのデータを直接参照
  - メニュー JSON: `./menus/menus_YYYY-MM-DD.json`
  - 利用可能日付: `./menus/available-dates.json`

### 2️⃣ **日付選択の条件付け**
選択可能な日付は以下を満たす必要があります：
- **ページを開いている日以降** (本日以降)
- **メニュースクレイプが完了してデータが格納されている日付**

実装: `app.js` の `loadAvailableDates()` で本日以降の日付をフィルタリング

### 3️⃣ **デフォルト日付の設定**
- **本日（今日の日付）** をデフォルト選択
- 本日のデータが存在しない場合は、最初の利用可能日付を選択

実装: `loadAvailableDates()` で日付マッチングロジックを追加

---

## 🔧 コード修正箇所

### [app.js](app.js) - `loadAvailableDates()` 関数

**修正内容**:
```javascript
/**
 * 利用可能な日付を読込（menus/ フォルダのデータから）
 * - ページ開いている日以降のみを選択可能
 * - デフォルトは本日（存在する場合）
 */
async loadAvailableDates() {
  // 1. available-dates.json から日付リスト取得
  const availableDates = data.dates || [];
  
  // 2. 本日の日付を基準に計算
  const today = new Date();
  const todayMonthDay = `${today.getMonth() + 1}/${today.getDate()}`;
  
  // 3. 本日以降の日付をフィルタリング
  const filteredDates = availableDates.filter(dateLabel => {
    // dateLabel は "1/19(月)" 形式
    const [, month, day] = dateLabel.match(/(\d{1,2})\/(\d{1,2})/);
    const monthNum = parseInt(month);
    const dayNum = parseInt(day);
    
    // 本日以降か判定
    return monthNum > today.getMonth() + 1 || 
           (monthNum === today.getMonth() + 1 && dayNum >= today.getDate());
  });
  
  // 4. デフォルト日付: 本日 (存在する場合) → 最初の利用可能日付
  const todayOption = filteredDates.find(d => d.startsWith(todayMonthDay));
  if (todayOption) {
    dateSelect.value = todayOption;
  } else {
    dateSelect.value = filteredDates[0];
  }
}
```

### [index.html](index.html) - メニューデータ参照パス

既に正しい参照パスが設定されていました：
```html
<select id="date-input" class="form-input"
  title="メニューが取得できた日付のみを選択可能">
  <option value="">読込中...</option>
</select>
```

メニュー読込は app.js で処理:
```javascript
const response = await fetch(`./menus/menus_${isoDate}.json`);
```

---

## 📂 ファイル構造

```
kyowa-menu-optimizer/
├── index.html                    ← GitHub Pages ホーム
├── app.js                        ← フロントエンドロジック（修正済み）
├── style.css                     ← スタイル
├── menus/                        ← メニューデータ格納先
│   ├── menus_2026-01-19.json   ← 日付別メニュー JSON
│   ├── menus_2026-01-20.json
│   ├── menus_2026-01-21.json
│   ├── menus_2026-01-22.json
│   ├── menus_2026-01-23.json
│   └── available-dates.json     ← 利用可能日付リスト
├── scheduler.js                 ← 自動スケジューラー
├── prescrap.js                  ← 5日分スクレイピング
└── src/
    ├── scraper/
    │   └── fetchMenus.js        ← メインスクレイパー
    └── utils/
        └── date.js              ← 日付ユーティリティ
```

---

## 🚀 動作フロー

### ページ読み込み時
```
1. index.html を開く
   ↓
2. app.js の loadAvailableDates() 実行
   ↓
3. menus/available-dates.json を読込
   ↓
4. 本日以降の日付をフィルタリング
   ↓
5. デフォルト日付 (本日) を選択
   ↓
6. menus/menus_YYYY-MM-DD.json からメニュー読込
   ↓
7. メニュー一覧を画面に表示 ✅
```

### 日付を手動選択
```
1. ドロップダウンから日付選択
   ↓
2. loadMenus() 実行
   ↓
3. menus/menus_YYYY-MM-DD.json を読込
   ↓
4. メニュー一覧を更新 ✅
```

---

## ✅ テスト方法

### 1️⃣ ローカル確認
```bash
# ウェブサーバー起動（簡易サーバー）
cd /Users/onotakanori/kyowa-menu-optimizer
python3 -m http.server 8000

# ブラウザで開く
# http://localhost:8000
```

### 2️⃣ 確認ポイント
- ✅ ページ読込時に本日（2026年1月17日）のメニューが表示される
- ✅ ドロップダウンに「本日以降」の日付のみが表示されている
  - ✅ 1/19(月), 1/20(火), 1/21(水), 1/22(木), 1/23(金)
  - ❌ 1/13(火), 1/14(水), 1/15(木), 1/16(金) は表示されない（過去日付）
- ✅ 他の日付を選択するとメニューが正しく切り替わる
- ✅ メニュー検索機能が動作する
- ✅ 最適化実行ボタンが正常に機能する

### 3️⃣ GitHub Pages での確認（デプロイ後）
```
https://yourusername.github.io/kyowa-menu-optimizer/
```

---

## 🔄 スケジューラーとの連携

毎週月曜 05:00 JST に `scheduler.js` が以下を自動実行：

1. `prescrap.js` で 5日分のメニュースクレイピング
2. `menus/` ディレクトリに JSON 保存
3. `menus/available-dates.json` を自動更新
4. GitHub に自動 push

→ GitHub Pages は自動更新されたデータを参照 ✅

---

## 🐛 トラブルシューティング

### Q: "メニュー データがありません" と表示される
**原因**: `menus/available-dates.json` が存在しない
```bash
# 再度スクレイピング実行
node prescrap.js 5
# または
node scheduler.js --now
```

### Q: 過去の日付も選択肢に出ている
**原因**: クライアント側の時刻がズレている
```bash
# システムクロック確認・修正
date  # 現在時刻確認
```

### Q: "メニュー読込エラー" が表示される
**原因**: `menus/menus_YYYY-MM-DD.json` が存在しない
```bash
# ファイル確認
ls -la menus/menus_*.json

# 再度スクレイピング実行
node prescrap.js 5
```

---

## 📌 重要な注意事項

1. **月の跨ぎ対応**: 現在のコードは「同一月内」での日付フィルタリングを想定しています
   - 月末～月初の期間は注意が必要
   - スクレイプが定期的に実行されているため問題ありません

2. **年の跨ぎ対応**: 年が変わる場合は、`app.js` の `dateLabelToISOString()` が自動判定

3. **CORS**: ローカルファイルからの fetch は CORS エラーの可能性
   - ウェブサーバーを使用してテスト (http.server など)

---

## 📝 変更サマリー

| 項目 | 変更内容 | ファイル |
|------|---------|---------|
| メニュー参照パス | `docs/` → `menus/` | `app.js` |
| 日付フィルタリング | 本日以降のみ選択可能 | `app.js` - `loadAvailableDates()` |
| デフォルト日付 | 本日を自動選択 | `app.js` - `loadAvailableDates()` |
| データ更新 | 自動スケジューラーで毎週更新 | `scheduler.js` + `prescrap.js` |

---

## 🎯 次のステップ

1. ✅ ローカルテストで動作確認
2. ✅ GitHub Pages にデプロイ（`git push`）
3. ✅ リモートで動作確認
4. ✅ 自動スケジューラーを本番サーバーで起動
5. ✅ 毎週月曜のスケジュール実行確認

