# スクレイパー再構築計画書

## 概要
スクレイピング用のコードが複雑化したため、機能を損なわないように再構築する。
基本機能は保持しつつ、コード構造を整理・簡潔化する。

**現在日付**: 2026年1月17日  
**目標**: 動作する、保守性の高いスクレイパーの再構築

---

## 再構築範囲

### 1. **メニュー取得処理（複数日）**
- **目的**: 今日の日付から最短の平日から数えて5日分のメニューを取得
- **入力**: 取得日数（デフォルト: 5日）
- **出力**: `menus/menus_YYYY-MM-DD.json` ファイル群 + `menus/available-dates.json`

### 2. **タブ切り替え機能**
- **目的**: 「今週来週」タブをクリックして表示を切り替える
- **必要性**: サイトのメニュー表示エリアをアクティベート
- **対象要素**: `#menu-target .tab-button`（「今週」を含むテキスト）
- **待機**: クリック後 800ms 待機（アニメーション完全待機）

### 3. **日付選択機能**
- **目的**: 指定した日付を選択し、該当日のメニューを表示
- **形式**: "1/12(月)" 形式
- **対象要素**: `.weeks-day-btn button.after-btn`
- **特性**: スクロール可能なため、スクロール後に再検索が必要
- **待機**: メニュー表示まで最大 5秒

### 4. **メニュー展開機能**
- **目的**: メニューリストを完全に展開する
- **方法**: 「次へ」ボタンをクリックし、メニュー数が増えるまで待機
- **対象要素**: `.menu-next-btn:not([disabled])`
- **待機**: メニュー数増加確認（最大5秒）
- **終了条件**: ボタンが存在しなくなる、または メニュー数が増えない

### 5. **メニュー取得・スクレイピング**
- **取得項目**:
  - メニュー名（`.menu-name`）
  - 栄養情報（`.menu-detail-cell` ペア）
- **詳細パネル**: `.menu-detail-btn` をクリックして表示
- **パネル閉じる**: `.menu-detail-header button` をクリック
- **エラー対応**: 個別メニュー取得失敗は全体エラーにしない
- **出力形式**:
  ```json
  {
    "dateLabel": "1/12(月)",
    "count": 10,
    "menus": [
      {
        "name": "メニュー名",
        "nutrition": {
          "カロリー": 123.5,
          "タンパク質": "5.0g",
          "脂質": 4.2
        }
      }
    ]
  }
  ```

---

## 現在のコード構成と関連関数

### ファイル構成

#### `prescrap.js` （エントリーポイント）
**責務**: 複数日のスクレイピング調整、ファイル保存管理

**関数一覧**:

| 関数名 | 責務 | 入出力 |
|--------|------|--------|
| `prescrapMultipleDays(numDays)` | メイン処理：複数日スクレイピングの調整 | 入: 日数 / 出: void |
| `getCacheFileName(dateLabel)` | 日付ラベルからJSONファイル名を生成 | 入: "1/12(木)" / 出: "menus_2026-01-12.json" |
| `saveMenusToOutput(dateLabel, data)` | スクレイピング結果をJSONで保存 | 入: dateLabel, data / 出: void（ファイル書き込み） |
| `generateAvailableDatesFile(dates)` | 利用可能な日付リストを生成 | 入: dateArray / 出: void（available-dates.json） |

**依存関係**: `fetchMenus`, `getNearestWeekday`, `toDateLabel`

**処理フロー**:
```
prescrapMultipleDays(5)
  ├─ getNearestWeekday() で最初の平日を取得
  └─ for i = 0 to 4:
      ├─ toDateLabel(date) で日付をラベル化
      ├─ fetchMenus(dateLabel) でメニュー取得
      ├─ saveMenusToOutput() で JSON 保存
      └─ 次の営業日に進む
```

---

#### `src/scraper/fetchMenus.js` （スクレイパーコア）
**責務**: 単一日付のメニュースクレイピング

**関数一覧**:

| 関数名 | 責務 | 入出力 |
|--------|------|--------|
| `fetchMenus(dateLabel)` | メイン処理：ブラウザ起動から終了までの全フロー | 入: "1/12(月)" / 出: {dateLabel, count, menus} |
| `selectTab(page, tabText)` | 指定テキストを含むタブをクリック | 入: page, "今週" / 出: void（例外発生） |
| `selectDate(page, dateLabel)` | 指定日付ボタンをクリック | 入: page, "1/12(月)" / 出: void（例外発生） |
| `expandAllMenus(page)` | 「次へ」ボタンをクリックしメニュー展開 | 入: page / 出: void |
| `scrapeMenus(page)` | メニュー名と栄養情報を抽出 | 入: page / 出: Array<{name, nutrition}> |

**重要な処理フロー**:
```
fetchMenus(dateLabel)
  ├─ ブラウザ起動（headless: true）
  ├─ サイト読み込み（https://kyowa2407225.uguide.info）
  ├─ waitForTimeout(2000) サイト完全読み込み待機
  ├─ selectTab(page, '今週') タブ切り替え
  ├─ selectDate(page, dateLabel) 日付選択
  ├─ expandAllMenus(page) メニュー展開
  ├─ scrapeMenus(page) メニュー・栄養情報抽出
  └─ finally: ブラウザ終了
```

**DOM セレクタ一覧**:

| 要素 | セレクタ | 説明 | 待機方法 |
|------|---------|------|---------|
| タブ | `#menu-target .tab-button` | 「今週」など（部分一致） | waitForSelector + evaluate |
| 日付ボタン | `.weeks-day-btn button.after-btn` | "1/12(月)" など | waitForSelector + evaluate |
| 展開ボタン | `.menu-next-btn:not([disabled])` | 「次へ」ボタン | page.$() |
| メニュー | `.menu-content` | 1メニュー単位 | waitForFunction |
| メニュー名 | `.menu-name` | メニューの名前 | locator().innerText() |
| 詳細ボタン | `.menu-detail-btn` | 栄養情報表示 | locator().click() |
| 詳細パネル見出し | `.menu-detail-name` | パネル表示確認用 | waitForSelector({state: 'visible'}) |
| 詳細セル | `.menu-detail-cell` | 栄養情報セル（2個ペア） | $$eval で配列取得 |

**タイミング・待機処理の詳細**:

```javascript
// 1. サイト読み込み直後
await page.waitForTimeout(2000);
// 理由: JavaScript実行、レンダリング完全待機

// 2. タブ切り替え後
await page.waitForTimeout(800);
// 理由: タブアニメーション、コンテンツ切り替え完全待機

// 3. 日付選択後
await page.waitForFunction(
  () => document.querySelectorAll('.menu-content').length > 0,
  { timeout: 5000 }
);
// 理由: メニュー要素が DOM に追加されるまで待機

// 4. 展開ボタンクリック後
while (Date.now() - startTime < 5000) {
  await page.waitForTimeout(200);
  currentCount = await page.$$eval('.menu-content', els => els.length);
  if (currentCount > beforeCount) break;
}
// 理由: メニュー数増加を確認（ネットワーク遅延対応）

// 5. 詳細パネル表示待機
await page.waitForSelector('.menu-detail-name', {
  state: 'visible',
  timeout: 3000
});
// 理由: パネル開閉アニメーション完全待機
```

---

#### `src/utils/date.js` （日付ユーティリティ）
**責務**: 日付計算とフォーマット変換

**関数一覧**:

| 関数名 | 責務 | 入出力 |
|--------|------|--------|
| `isWeekday(date)` | 平日判定（日・土を除外） | 入: Date / 出: boolean |
| `getNearestWeekday(startDate)` | 最短の次平日を取得（今日が平日ならそのまま） | 入: Date \| undefined / 出: Date |
| `toDateLabel(date)` | Date → "1/12(月)" 形式に変換 | 入: Date / 出: "1/12(月)" |
| `parseDate(dateString)` | "YYYY-MM-DD" → Date に変換 | 入: "2026-01-12" / 出: Date |

**暦計算ロジック**:
```
isWeekday(date)
  → dayOfWeek = date.getDay()  // 0=日, 1=月, ..., 6=土
  → return (dayOfWeek !== 0 && dayOfWeek !== 6)

getNearestWeekday(startDate = new Date())
  → date = startDate のコピー
  → if isWeekday(date): return date
  → else: 最大7日ループして最初の平日を探す
  
toDateLabel(date)
  → month = date.getMonth() + 1
  → day = date.getDate()
  → weekday = ['(日)', '(月)', ..., '(土)'][date.getDay()]
  → return `${month}/${day}${weekday}`
```

**使用例**:
```javascript
const today = new Date();  // 2026-01-17（土）
const nearest = getNearestWeekday(today);  // 2026-01-19（月）
const label = toDateLabel(nearest);  // "1/19(月)"
```

---

## 再構築における重要ポイント

### ✅ 保持すべき機能（品質基準）

1. **ブラウザ生存期間管理**
   - `finally` ブロックで確実にブラウザを閉じる
   - ゾンビプロセス防止

2. **DOM 待機**
   - `waitForSelector()` で存在確認後アクション
   - `waitForFunction()` で条件確認後進行
   - タイムアウト値は 5000ms が基本（ネットワーク遅延対応）

3. **エラーハンドリング**
   - 個別メニューの取得失敗は全体エラーにしない
   - `continue` で次メニューへ進む
   - 統計情報（成功/失敗/合計）はログ出力

4. **スクロール対応**
   - 日付ボタンはスクロール可能なコンテナ内
   - スクロール後に再検索する二段階検索ロジック

5. **タイミング調整**
   - アニメーション: 800ms
   - ネットワーク遅延: 5000ms
   - 軽い待機: 200-300ms

---

### ⚠️ 改善が必要な部分

| 項目 | 問題点 | 対策 |
|------|--------|------|
| **日付選択の信頼性** | 「1/15(木)」が見つからないエラー発生 | デバッグモード（headless: false）で実際DOM確認 |
| **コード複雑性** | `evaluate()` 内の処理が複雑化 | 単一責任原則強調、関数の小分割化 |
| **ログ出力** | デバッグログが多すぎて可読性低下 | ログレベル導入（INFO, DEBUG, ERROR）またはフラグ制御 |

---

## 再構築ステップ

### Phase 1: 基本骨組み作成
**目標**: 新しいスクレイパーファイルの基本構造完成
- [ ] `src/scraper/fetchMenus_v2.js` を新規作成
- [ ] `fetchMenus()` 関数署名を実装
- [ ] 日付ユーティリティの動作確認

### Phase 2: ブラウザ・タブ処理
**目標**: ブラウザ起動とタブ切り替えが動作
- [ ] ブラウザ起動処理実装
- [ ] サイト読み込み処理実装
- [ ] `selectTab()` 関数実装
- [ ] テスト: サイトがブラウザで開き、タブが見える

### Phase 3: 日付選択・メニュー展開
**目標**: 日付選択と展開ボタン機能が動作
- [ ] `selectDate()` 関数実装
- [ ] `expandAllMenus()` 関数実装
- [ ] メニュー数カウント確認
- [ ] テスト: 指定日付が選択され、メニューが展開される

### Phase 4: スクレイピング・データ抽出
**目標**: メニュー名と栄養情報が正確に抽出される
- [ ] メニュー名抽出の実装
- [ ] 栄養情報抽出の実装
- [ ] 詳細パネル開閉処理実装
- [ ] テスト: JSON 形式で正確に出力される

### Phase 5: 統合テスト
**目標**: 実際の運用環境で動作確認
- [ ] 単一日付のテスト（1日分のみ取得）
- [ ] 複数日のテスト（`prescrap.js` からの呼び出し）
- [ ] エラーケースの確認（ネットワーク遅延、不正な日付など）

### Phase 6: 既存コード置き換え
**目標**: 新しいコードへの完全置き換え
- [ ] 動作確認後、既存 `fetchMenus.js` をバックアップ
- [ ] 新しいコードに切り替え
- [ ] 回帰テスト実施
- [ ] Git コミット

---

## トラブルシューティング リファレンス

### DOM 構造確認

**目的**: サイトの実際の DOM 構造を確認する  
**コマンド**: 
```bash
npx playwright open chromium https://kyowa2407225.uguide.info
```
**使用方法**:
- ブラウザが開き、インスペクターで DOM を確認可能
- 要素をクリックして、セレクタをテスト
- コンソールで `document.querySelectorAll()` を実行

---

### よくある問題と対応

| 問題 | 原因の可能性 | 確認方法 | 対応方法 |
|------|----------|--------|---------|
| 日付が見つからない | DOM構造変化 \| サイト仕様変更 | `headless: false` で実際確認 | セレクタを修正 \| waitを延長 |
| メニューが展開されない | タイムアウト値不足 \| ネットワーク遅延 | ログから展開回数確認 | 待機時間を 5000→7000ms に延長 |
| ブラウザプロセスが残る | `finally` ブロック未実行 \| 例外発生 | `lsof \| grep chromium` | 例外ハンドリング強化 |
| 栄養情報が取得できない | 詳細パネル開閉タイミング | `.menu-detail-cell` 数をログ | パネルクローズ待機延長 |
| スクレイピング中にエラー | メモリ不足 \| ブラウザクラッシュ | ブラウザログ確認 | メモリ効率化検討 |

---

## 参考：既存コード品質指標

| 項目 | スコア | コメント |
|------|--------|---------|
| 関数責務の明確さ | 中程度 | selectDate が複雑、分割推奨 |
| エラーハンドリング | 良好 | 個別失敗が全体を止めない設計 |
| テスト容易性 | 低 | ブラウザ依存のため実テスト必須 |
| 保守性 | 低 | ハードコードされたセレクタが多い |
| ログの適切さ | 低 | デバッグログが過剰 |

---

## 再構築時に参照すべきセクション

**コード生成時に必ず確認**:
1. ✅ **再構築範囲** - 何を実装するのか
2. ✅ **DOM セレクタ一覧** - 正確なセレクタを使用
3. ✅ **タイミング・待機処理** - waitの値を正確に設定
4. ✅ **処理フロー** - 関数の呼び出し順序
5. ✅ **トラブルシューティング** - 問題時の対応方法

---

## 出力ファイル形式

### JSON ファイル構造（`menus/menus_YYYY-MM-DD.json`）

```json
{
  "dateLabel": "1/12(月)",
  "count": 15,
  "menus": [
    {
      "name": "鶏肉唐揚げ定食",
      "nutrition": {
        "エネルギー": 650,
        "たんぱく質": 28.5,
        "脂質": 24.3,
        "炭水化物": 72,
        "塩分": "2.1g",
        "カロリー": 650.5
      }
    },
    {
      "name": "野菜うどん",
      "nutrition": {
        "エネルギー": 420,
        "たんぱく質": 12.3,
        "脂質": 8.5,
        "炭水化物": 68.2,
        "塩分": "3.2g"
      }
    }
  ]
}
```

### 利用可能日付リスト（`menus/available-dates.json`）

```json
{
  "dates": [
    "1/12(月)",
    "1/13(火)",
    "1/14(水)",
    "1/15(木)",
    "1/16(金)"
  ]
}
```

---

## 次のステップ

**このプランを基に**:
1. 👉 **Phase 1** を実行: `src/scraper/fetchMenus_v2.js` を新規作成
2. 各セクションを参照しながら、段階的に実装
3. 必ず **トラブルシューティング** を確認
4. 動作確認後、既存コードを置き換え
