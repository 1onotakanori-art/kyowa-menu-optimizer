# Step 5-2: E2Eテスト計画書

**実行日**: 2026年2月1日  
**対象**: prescrap.js → admin.html → GitHub API → 学習パイプライン → app.html  
**ステータス**: 🔴 実行中

---

## 🎯 テスト目標

**完全なエンドツーエンドフロー**を検証し、各コンポーネント間の連携が正常に機能することを確認する。

```
prescrap.js
   ↓
menus_YYYY-MM-DD.json
   ↓
admin.html（メニュー読み込み → 選択 → 評価 → 保存）
   ↓
kyowa-menu-history/data/history/YYYY-MM-DD.json
   ↓
ml/train_seq2set.py + ml/generate_ai_recommendations.py
   ↓
docs/ai-selections/ai-selections_YYYY-MM-DD.json
   ↓
app.html（推奨表示）
```

---

## 📋 テスト手順

### Phase 1: テスト環境の準備

#### 1-1. ローカルサーバーの起動
```bash
cd /Users/onotakanori/Apps/kyowa-menu-optimizer
python3 -m http.server 8000
# http://localhost:8000 でアクセス可能
```

#### 1-2. 日付の確認
```bash
# テスト用に最新の平日 3 日分を使用
node -e "
const d = new Date();
for(let i = 0; i < 3; i++) {
  while(d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1);
  console.log(d.toISOString().split('T')[0]);
  d.setDate(d.getDate() + 1);
}
"
```

---

### Phase 2: メニュー取得テスト

#### 2-1. prescrap.js で最新メニュー取得
```bash
node prescrap.js 3  # 3日分を取得
```

**期待される出力**:
```
✅ menus_YYYY-MM-DD.json を生成（3ファイル）
✅ available-dates.json を生成
```

#### 2-2. メニューファイルの確認
```bash
# ファイルが生成されたか確認
ls -la menus/menus_*.json | tail -3

# 内容を確認
jq '.menus | length' menus/menus_2026-02-*.json
```

**期待される結果**:
```
menus_2026-02-XX.json: 40-50メニュー
```

---

### Phase 3: admin.html での操作テスト

#### 3-1. ブラウザでアクセス
```
URL: http://localhost:8000/admin.html
```

#### 3-2. 操作フロー
```
Step 1: GitHub Token を設定（必要に応じて）
Step 2: 日付を選択（例: 2026-02-02）
Step 3: 「メニュー読込」をクリック
        ↓
        メニュー一覧が表示される
Step 4: メニューを3〜5個選択
        ↓
        選択時に自動で星評価が表示される（デフォルト: ★★★☆☆）
Step 5: 星をタップして評価を変更
        - メニュー1: ★★★★★ (5)
        - メニュー2: ★★★★☆ (4)
        - メニュー3: ★★★☆☆ (3)
Step 6: 「記録を保存」をクリック
        ↓
        ローカルストレージに保存成功のメッセージ
```

**確認項目**:
- [ ] メニューが正常に読み込まれたか
- [ ] チェックボックスで選択できるか
- [ ] 星評価が表示されるか
- [ ] 星をタップで評価が変わるか
- [ ] 「記録を保存」ボタンが動作するか
- [ ] 成功メッセージが表示されるか

---

### Phase 4: GitHub API保存テスト

#### 4-1. ブラウザのコンソールで確認
```javascript
// ブラウザコンソール (F12) で実行
localStorage.getItem('history_2026-02-02')

// 期待される出力:
{
  "date": "2026-02-02",
  "selectedMenus": [
    {"name": "メニュー1", "nutrition": {...}, "rating": 5},
    {"name": "メニュー2", "nutrition": {...}, "rating": 4},
    {"name": "メニュー3", "nutrition": {...}, "rating": 3}
  ],
  "totals": {...}
}
```

#### 4-2. GitHub Pages からの読み込みテスト
```bash
# kyowa-menu-history リポジトリから自動取得されるか確認
curl -s "https://1onotakanori-art.github.io/kyowa-menu-history/data/history/2026-02-02.json" | jq .
```

**期待される結果**:
- GitHub Pages にデータが公開されている
- rating フィールドが含まれている

---

### Phase 5: 学習パイプラインテスト

#### 5-1. Seq2Set 学習の実行
```bash
cd /Users/onotakanori/Apps/kyowa-menu-optimizer
.venv/bin/python ml/train_seq2set.py 2>&1 | tail -50
```

**期待される出力**:
```
📅 学習期間: 2026-02-02 ~ 2026-02-04 (3日)
🍽️  総メニュー数: 123
📊 データ分割:
   訓練: 1サンプル
   検証: 0サンプル
   
✅ 学習完了
📊 モデルパフォーマンス:
   訓練損失: 0.XXX
   検証損失: N/A
```

#### 5-2. AI推奨生成の実行
```bash
.venv/bin/python ml/generate_ai_recommendations.py 2>&1 | tail -50
```

**期待される出力**:
```
🚀 推奨生成を開始
📅 処理日付: 3日
✅ [1/3] 2026-02-02
✅ [2/3] 2026-02-03
✅ [3/3] 2026-02-04

✅ 生成完了
📊 推奨統計:
   平均複合スコア: 0.XXX
   成功率: 100%
```

#### 5-3. 生成されたデータの確認
```bash
# 推奨データが生成されたか確認
ls -la docs/ai-selections/ai-selections_2026-02-*.json

# 内容を確認
jq '.recommendations[0]' docs/ai-selections/ai-selections_2026-02-02.json
```

**期待される結果**:
```json
{
  "rank": 1,
  "name": "メニュー名",
  "model_score": 0.7672,
  "composite_score": 0.6036,
  "score_improvement": -0.1636
}
```

---

### Phase 6: app.html での表示テスト

#### 6-1. ブラウザでアクセス
```
URL: http://localhost:8000/app.html
```

#### 6-2. 日付選択 & 表示確認
```
Step 1: 日付選択ドロップダウンから 2026-02-02 を選択
Step 2: 「AI推奨」タブに切り替え
        ↓
        推奨メニューが表示される
Step 3: 各メニューのスコア分解を確認
        - 複合スコア（Composite Score）
        - モデルスコア（Model Score）
        - 多様性スコア（Diversity Score）
        - 栄養マッチスコア（Nutrition Match Score）
```

**確認項目**:
- [ ] 推奨メニューが表示されるか
- [ ] スコア分解情報が表示されるか
- [ ] チャートが正常に描画されるか
- [ ] 過去の記録が表示されるか（ONO Menus タブ）

---

## 🔍 トラブルシューティング

### 問題1: admin.html でメニューが読み込まれない
```
原因: menus_YYYY-MM-DD.json が生成されていない
対応: prescrap.js を実行してメニューを取得
```

### 問題2: GitHub API 保存が失敗する
```
原因: Personal Access Token が設定されていない
対応: トークンを localStorage に保存するか、ローカル保存のみで進める
```

### 問題3: 学習がスキップされる
```
原因: history ファイルがない
対応: admin.html で先に保存してから学習を実行
```

### 問題4: 推奨が表示されない
```
原因: ai-selections ファイルが生成されていない
対応: ml/generate_ai_recommendations.py の実行ログを確認
```

---

## 📊 チェックリスト

### 環境準備
- [ ] ローカルサーバー起動（http://localhost:8000）
- [ ] menus/ ディレクトリに 3 日分のメニュー存在

### admin.html テスト
- [ ] メニュー読み込み成功
- [ ] メニュー選択可能
- [ ] 星評価表示・変更可能
- [ ] 記録保存成功（ローカル）

### GitHub API テスト（オプション）
- [ ] GitHub Personal Access Token 設定
- [ ] GitHub API 経由の保存成功
- [ ] kyowa-menu-history に データが反映

### 学習テスト
- [ ] train_seq2set.py 実行成功
- [ ] generate_ai_recommendations.py 実行成功
- [ ] ai-selections JSON 生成確認

### app.html テスト
- [ ] 推奨メニュー表示
- [ ] スコア分解表示
- [ ] 過去記録表示

---

## 📝 テスト結果記録

**テスト実行日**: ___________  
**実行者**: ___________

### Phase 1 結果
```
状態: ✅ / ⚠️ / ❌
コメント: 
```

### Phase 2 結果
```
状態: ✅ / ⚠️ / ❌
生成メニュー: ___________
コメント: 
```

### Phase 3 結果
```
状態: ✅ / ⚠️ / ❌
選択メニュー数: ___________
コメント: 
```

### Phase 4 結果
```
状態: ✅ / ⚠️ / ❌
GitHub 保存: ✅ / ❌
コメント: 
```

### Phase 5 結果
```
状態: ✅ / ⚠️ / ❌
学習完了: ✅ / ❌
推奨生成: ✅ / ❌
コメント: 
```

### Phase 6 結果
```
状態: ✅ / ⚠️ / ❌
表示確認: ✅ / ❌
コメント: 
```

---

## 🎯 成功基準

**E2E テスト成功**: 以下を全て達成

```
✅ Phase 1: 環境準備 - 完了
✅ Phase 2: メニュー取得 - 3日分取得成功
✅ Phase 3: admin.html - 選択・評価・保存完了
✅ Phase 4: GitHub API - ローカル保存成功（GitHub API はオプション）
✅ Phase 5: 学習 - train_seq2set + generate_ai_recommendations 成功
✅ Phase 6: app.html - 推奨表示確認成功

最終判定: ✅ E2E テスト完了
```

---

## 🚀 次のステップ

テスト完了後:
1. iOS/iPhone での動作確認（Step 5-2b）
2. ユーザーテスト＆フィードバック（Step 6）
3. 本番デプロイ（GitHub Pages + GitHub Actions）

---

**テスト計画作成日**: 2026年2月1日  
**予定実行時間**: 1-2時間
