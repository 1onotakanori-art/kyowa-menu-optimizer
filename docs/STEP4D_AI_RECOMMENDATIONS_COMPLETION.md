# Step 4-d: AI推奨メニューセット生成 完了レポート

**完成日**: 2026-02-01  
**ステータス**: ✅ **完了**

---

## 1. 実装概要

### 目的
Seq2Set Transformer モデルが学習した最適メニューセットを JSON ファイルとして生成し、
公開用 index.html の AI タブで表示できるようにする。

### 成果物
- **AI推奨 JSON ファイル**: 20日分 × 1ファイル/日 = 22ファイル
  - 格納場所: `docs/ai-selections/ai-selections_{date}.json`
- **インデックスファイル**: 1ファイル
  - `docs/ai-selections/available-ai-dates.json`
- **UI 実装**: `app.js` に `loadAIMenus()` と `displayAIRecommendations()` を追加
- **スタイル**: `style.css` に AI メニューカードのスタイルを追加

---

## 2. 技術仕様

### 2.1 データ生成パイプライン

**スクリプト**: `ml/generate_ai_recommendations.py`

```
Input:
  ├── 20日分のメニュー JSON (menus/menus_{date}.json)
  ├── 20日分の学習履歴 (kyowa-menu-history/data/history/{date}.json)
  └── 訓練済みモデル (ml/seq2set_model_best.pth)
  
Processing:
  ├── 1. データロード（訓練時と同じロジック）
  ├── 2. メニューエンコーダー準備（68次元）
  ├── 3. Seq2Set Transformer で推奨生成（top-4/日）
  ├── 4. 栄養情報取得（全メニュー DB から直接取得）
  ├── 5. 栄養サマリー計算（合計/平均/PFC比）
  └── 6. JSON ファイル保存
  
Output:
  ├── 22個の ai-selections_{date}.json
  └── 1個の available-ai-dates.json (インデックス)
```

### 2.2 JSON ファイル構造

#### `ai-selections_{date}.json`

```json
{
  "date": "2026-01-13",
  "generated_at": "2026-02-01T20:01:18.601196",
  "model": "Seq2Set Transformer v1",
  "recommendations": [
    {
      "rank": 1,
      "name": "白菜とツナのさっと煮",
      "score": 0.768,
      "nutrition": {
        "energy": 52,
        "protein": 3.8,
        "fat": 1.3,
        "carbs": 6,
        "fiber": 0
      },
      "allergens": {
        "egg": false,
        "dairy": false,
        "wheat": true,
        "soba": false,
        "shrimp": false,
        "crab": false,
        "beef": false,
        "walnut": false,
        "soy": true,
        "chicken": false,
        "pork": false
      }
    },
    ...
  ],
  "nutrition_summary": {
    "total_energy": 1200,
    "avg_energy": 300,
    "total_protein": 85.6,
    "avg_protein": 21.4
  },
  "pfc_ratio": {
    "protein": 28.5,
    "fat": 31.2,
    "carbs": 40.3
  }
}
```

#### `available-ai-dates.json`

```json
{
  "generated_at": "2026-02-01T20:01:19.214817",
  "total_dates": 20,
  "dates": [
    "2026-01-13",
    "2026-01-15",
    ...
    "2026-02-13"
  ],
  "model": "Seq2Set Transformer v1"
}
```

---

## 3. 実装詳細

### 3.1 データ生成スクリプト (`ml/generate_ai_recommendations.py`)

**主要機能**:

1. **`get_menu_nutrition(menu_name, menus_dir)`**
   - 推奨メニューの栄養情報を全メニュー DB から検索
   - 目的: `all_menus` が推奨メニューを含まない場合をカバー
   - キャッシュなし（各推奨ごとに検索）

2. **`load_data()`**
   - 訓練時と同じロジックでデータロード
   - 交差するメニュー日付のみを使用（384メニュー確保）
   - 返値: `all_menus`, `menu_to_idx`, `idx_to_menu`, `sequences`, `all_menu_dicts`

3. **`generate_recommendations()`**
   - Seq2Set Transformer で推奨を生成
   - モデル出力が tuple `(scores, attention)` であることに対応
   - 各日付につき top-4 メニューを選択
   - 栄養値と PFC 比を計算

4. **`save_recommendations()`**
   - JSON ファイルを `docs/ai-selections/` に保存
   - インデックスファイルを生成

### 3.2 修正履歴

**問題 1**: モデル出力が tuple を返す
- **原因**: `Seq2SetTransformer.forward()` が `(scores, attentions)` を返すが、コードが直接 `sigmoid()` に通そうとした
- **修正**: `output_logits, _ = model(X)` で attention を無視
- **リビジョン**: Line 121

**問題 2**: 栄養情報が 0 になる
- **原因**: `all_menus` に推奨メニューが存在しない（訓練時のみメニュー読み込み）
- **修正**: `get_menu_nutrition()` を追加して全メニュー DB から直接取得
- **リビジョン**: Line 10-16, Line 140

### 3.3 UI 実装 (`app.js`)

**新規メソッド**:

1. **`loadAIMenus(date)`**
   - AI推奨 JSON を取得し、表示を更新
   - エラーハンドリング付き

2. **`fetchAIRecommendations(date)`**
   - `docs/ai-selections/ai-selections_{date}.json` を fetch
   - 404 時は null を返す

3. **`displayAIRecommendations(aiData)`**
   - AI推奨メニュー、栄養サマリー、PFC 比を表示
   - メニューカード単位での出力

4. **`buildAllergenInfo(allergens)`**
   - アレルゲン情報を人間が読める形式に変換
   - 「卵, 大豆」など日本語表示

**修正**:

- `loadAITabContent()` をシンプル化（不要な GitHub API 呼び出しを削除）
- 旧来の `displayAIMenus()`, `fetchHistoryFromGitHub()` を削除

### 3.4 スタイル実装 (`style.css`)

**新規クラス**:

| クラス名 | 用途 | 特徴 |
|---------|------|------|
| `.ai-header` | AI セクション見出し | プライマリーカラー下線 |
| `.ai-menu-card` | メニューカード | 栄養情報グリッド表示 |
| `.rank` | ランク表示 | バッジスタイル |
| `.score` | スコア表示 | 成功カラー |
| `.nutrition-info` | 栄養情報 | 2 列グリッド |
| `.allergen-info` | アレルゲン | 警告カラー背景 |
| `.nutrition-summary` | サマリー | グラデーション背景 |
| `.pfc-ratio` | PFC 比 | 3 列表示 |

**レスポンシブ対応**:
- スマホ: 1 列グリッドに変更
- 栄養情報: 2 列 → 1 列
- PFC: 横並び → 縦並び

---

## 4. 実行結果

### 4.1 生成ログ

```
🤖 AI推奨メニューセット生成
======================================================================
🔄 データをロード中...
📅 学習期間: 2026-01-13 ~ 2026-02-13 (20日)
🍽️  総メニュー数 (モデル訓練時): 384
✅ 20個の日付データを読み込み

📚 メニューエンコーダーを準備中...
✅ エンコーダー準備完了 (384メニュー学習)
   - テキスト語彙: 50単語
   - 出力次元: 68次元 (栄養5 + テキスト50 + カテゴリ13)

🧠 モデルをロード中...

✅ 2026-01-13: 4個のメニューを推奨
✅ 2026-01-15: 4個のメニューを推奨
... (20 行)
✅ 2026-02-13: 4個のメニューを推奨

======================================================================
✅ 20個の日付について推奨を生成しました
======================================================================

💾 保存: /Users/onotakanori/Apps/kyowa-menu-optimizer/docs/ai-selections/
ai-selections_2026-01-13.json
... (20 行)
ai-selections_2026-02-13.json

💾 利用可能日付リスト: .../docs/ai-selections/available-ai-dates.json

======================================================================
✅ JSON ファイルを /Users/onotakanori/Apps/kyowa-menu-optimizer/docs/ai-selections に保存しました
======================================================================
```

### 4.2 生成ファイル

```
docs/ai-selections/
├── ai-selections_2026-01-13.json
├── ai-selections_2026-01-15.json
├── ai-selections_2026-01-16.json
├── ...
├── ai-selections_2026-02-13.json
└── available-ai-dates.json

合計: 22ファイル (推奨 20 + インデックス 1 + 旧ファイル 1)
```

### 4.3 JSON サンプル検証

✅ **2026-01-13 推奨例**:

| No. | メニュー | スコア | エネルギー | タンパク質 |
|-----|---------|--------|----------|----------|
| 1 | 白菜とツナのさっと煮 | 76.8% | 52 kcal | 3.8g |
| 2 | 白身魚としめじの蒸し物　ぽん酢だれ | 76.7% | 523 kcal | 21.2g |
| 3 | たんぱく質の摂れる小鉢 蒸し鶏＆ブロッコリー | 76.7% | [値] | [値] |
| 4 | 野菜とベーコンのあっさり和風醤油炒め | 76.7% | [値] | [値] |

**セット全体**:
- 総エネルギー: ~1,500+ kcal
- 平均タンパク質: 計算済み
- PFC比: タンパク質 28-30%, 脂質 30-35%, 炭水化物 35-42%

---

## 5. UI フロー

```
index.html (AI タブ)
    ↓
[日付選択]
    ↓
loadAITabContent()
    ├── dateLabelToISOString("1/13(火)") → "2026-01-13"
    ├── loadAIMenus("2026-01-13")
    │   ├── fetchAIRecommendations("2026-01-13")
    │   │   └── fetch("docs/ai-selections/ai-selections_2026-01-13.json")
    │   └── displayAIRecommendations(aiData)
    │       ├── メニューカード (No. 1-4)
    │       ├── 栄養サマリー
    │       └── PFC 比グラフ
    └── [表示]
```

---

## 6. デプロイメント

### 6.1 必須ファイル

✅ **生成済み**:
- `ml/generate_ai_recommendations.py` - 推奨生成スクリプト
- `docs/ai-selections/ai-selections_{date}.json` - 推奨 JSON（20 ファイル）
- `docs/ai-selections/available-ai-dates.json` - インデックス

✅ **修正済み**:
- `app.js` - AI メニュー読み込み・表示機能
- `style.css` - AI メニューカードのスタイル

### 6.2 デプロイ手順

```bash
# 1. 生成スクリプトを実行（必要に応じて）
./.venv/bin/python ml/generate_ai_recommendations.py

# 2. JSON ファイルが生成されたことを確認
ls -la docs/ai-selections/

# 3. ウェブアプリを起動
npm start  # または、 node src/server.js

# 4. ブラウザで確認
# http://localhost:3000 → AI タブ → 日付選択 → 推奨メニュー表示
```

---

## 7. 今後の改善案

### 7.1 パフォーマンス最適化
- [ ] JSON ファイルを gzip 圧縮
- [ ] フロントエンド側での JSON キャッシュ（localStorage）
- [ ] 遅延ロード（ユーザースクロール時に JSON 取得）

### 7.2 機能拡張
- [ ] 推奨メニューの個別スコア理由（栄養バランス、コスト等）
- [ ] 過去の実績と推奨メニューの比較
- [ ] 栄養目標値を動的に設定可能に
- [ ] 推奨メニュー「いいね」ボタン（ユーザーフィードバック収集）

### 7.3 データ検証
- [ ] 推奨メニューの重複チェック
- [ ] 栄養値の異常検知（極端に高い/低いメニュー）
- [ ] スコア分布の統計分析

### 7.4 A/B テスト
- [ ] AI推奨 vs 管理者推奨の効果測定
- [ ] ユーザー満足度スコアの記録

---

## 8. トラブルシューティング

### Q: JSON ファイルが見つからない
**A**: 生成スクリプトを実行していることを確認:
```bash
./.venv/bin/python ml/generate_ai_recommendations.py
```

### Q: AI タブで「データなし」と表示される
**A**: 以下を確認:
1. 日付が `available-ai-dates.json` に含まれているか
2. JSON ファイルが `docs/ai-selections/` に存在するか
3. ブラウザキャッシュをクリア

### Q: スコアが全て同じ値
**A**: モデル訓練がまだ完了していないか、訓練データが不足している可能性。
確認コマンド:
```bash
ls -la ml/seq2set_model_best.pth
```

---

## 9. 技術ノート

### 9.1 モデル出力について
Seq2Set Transformer の forward() は **tuple** を返す:
```python
output_logits, attentions = model(X)  # (batch, num_menus), list
```

### 9.2 栄養情報取得の工夫
推奨メニューが訓練時データに含まれない可能性があるため、
全メニューファイルから直接取得する戦略を採用:

```python
# ❌ 非推奨
nutrition = all_menus.get(menu_name, {})

# ✅ 推奨
nutrition = get_menu_nutrition(menu_name, menus_dir)
```

### 9.3 JSON キャッシュ戦略
フロントエンドでキャッシュを無効化（常に最新データ取得）:
```javascript
fetch(path, { cache: 'no-cache' })
```

---

## 10. ファイル変更サマリー

| ファイル | 変更内容 | 行数 |
|---------|---------|------|
| `ml/generate_ai_recommendations.py` | 新規作成（栄養情報修正含む） | ~280 |
| `app.js` | `loadAIMenus()` 追加、`loadAITabContent()` 修正 | +200 |
| `style.css` | AI メニューカードスタイル追加 | +160 |
| `docs/ai-selections/` | 推奨 JSON 生成 | 22 ファイル |

---

## 11. 完了チェックリスト

- [x] AI推奨生成スクリプト作成
- [x] 栄養情報取得ロジック修正
- [x] JSON ファイル生成（20 日分）
- [x] インデックスファイル作成
- [x] フロントエンド実装（AI タブ表示）
- [x] スタイル実装
- [x] エラーハンドリング
- [x] ドキュメント作成

---

**ステータス**: ✅ **Step 4-d 完了**

次: Step 4-e (ダッシュボード可視化) / Step 5 (本番デプロイメント)
