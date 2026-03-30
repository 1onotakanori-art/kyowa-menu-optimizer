# AIタブ クイックスタートガイド

## 概要
このガイドでは、Supabaseベースの新しいAI推薦システムの使い方を説明します。

## 前提条件
- [x] Supabaseプロジェクトがセットアップ済み
- [x] `meal_history`テーブルが作成済み
- [x] Python 3.9以上がインストール済み

## セットアップ

### 1. Python環境の準備
```bash
# 仮想環境を作成（初回のみ）
python3 -m venv .venv

# 仮想環境を有効化
source .venv/bin/activate  # macOS/Linux
# または
.venv\Scripts\activate  # Windows

# 依存関係をインストール
pip install -r requirements.txt
```

### 2. データの準備
```bash
# Supabaseデータローダーをテスト
python ml/supabase_data_loader.py

# 出力例:
# ✅ Supabaseクライアント初期化完了
# ✅ 5件の食事履歴を取得しました
# ✅ 5日分の学習データを準備しました
```

## 日常的な使い方

### Step 1: 食事記録を保存
1. `admin.html`を開く
2. 日付を選択してメニューを読み込む
3. 食べたメニューを選択
4. 「保存」ボタンをクリック
   - データは自動的にSupabaseに保存されます

### Step 2: モデルを学習
```bash
# Supabaseから学習データを取得して学習
python ml/menu_recommender.py

# 出力例:
# 📡 Supabaseから学習データを取得中...
# ✅ Supabaseからデータ読み込み完了: 5日分
# 🔧 特徴量準備中...
# 🤖 モデル学習中...
# ✅ モデル保存完了: ml/model/menu_recommender.pkl
```

**学習頻度の目安:**
- 新しい食事記録を3〜5件追加したら学習
- 週1回程度の定期学習を推奨

### Step 3: AI推薦を生成
```bash
# 全日付のAI推薦を生成
python ml/generate_ai_selections.py

# 出力例:
# === 2026-01-13 の推薦を生成中 ===
#   ✓ 40メニュー中、TOP3を選択
# ✓ 完了: 28日分のAI推薦を生成しました
```

### Step 4: GitHub Pagesにデプロイ
```bash
# 生成されたファイルをGitに追加
git add docs/ai-selections/

# コミット
git commit -m "Update AI recommendations"

# プッシュ
git push origin main
```

## トラブルシューティング

### エラー: "supabase-py パッケージがインストールされていません"
```bash
pip install supabase
```

### エラー: "Supabaseにデータがありません"
1. `admin.html`で食事記録を保存しているか確認
2. Supabaseダッシュボードで`meal_history`テーブルを確認
3. データがない場合は、最低3件の食事記録を追加

### エラー: "モデルが見つかりません"
```bash
# モデルを新規作成
python ml/menu_recommender.py
```

### エラー: "メニューファイルが見つかりません"
- `menus/menus_YYYY-MM-DD.json`ファイルが必要
- メニューをスクレイピング: `node prescrap.js`

## データフロー図

```
┌─────────────┐
│ admin.html  │ 食事記録を入力
└──────┬──────┘
       │ 保存
       ▼
┌─────────────────┐
│   Supabase      │ meal_historyテーブル
│ meal_history    │
└──────┬──────────┘
       │ 自動取得
       ▼
┌─────────────────┐
│ menu_recommender│ モデル学習
│      .py        │
└──────┬──────────┘
       │ モデル保存
       ▼
┌─────────────────┐
│ generate_ai_    │ AI推薦生成
│ selections.py   │
└──────┬──────────┘
       │ JSON出力
       ▼
┌─────────────────┐
│ docs/ai-        │ GitHub Pages
│ selections/     │
└─────────────────┘
       │
       ▼
┌─────────────────┐
│   app.js        │ AIタブで表示
│   (AIタブ)      │
└─────────────────┘
```

## よくある質問

### Q1: 学習にどのくらいのデータが必要？
**A:** 最低3日分の食事記録があれば学習可能です。推薦の精度向上には10日分以上を推奨します。

### Q2: 学習時間はどのくらい？
**A:** データ量にもよりますが、通常は数秒〜1分程度です。

### Q3: AIタブにデータが表示されない
**A:** 以下を確認してください:
1. `docs/ai-selections/ai-selections_YYYY-MM-DD.json`ファイルが存在するか
2. GitHubにプッシュ済みか
3. GitHub Pagesが最新化されているか（数分かかる場合があります）

### Q4: ローカルファイルモードに戻したい
**A:** `menu_recommender.py`の`load_data()`を以下のように呼び出します:
```python
recommender.load_data(use_supabase=False, data_path='data/training_data.json')
```

## 次のステップ

1. **定期的な学習**: 週1回の学習を習慣化
2. **データ蓄積**: 継続的に食事記録を追加
3. **精度向上**: データが増えるほど推薦精度が向上

## 参照ドキュメント

- [AI Supabase移行レポート](./AI_SUPABASE_MIGRATION.md)
- [Supabaseセットアップガイド](./SUPABASE_SETUP.md)
- [管理画面セットアップ](./ADMIN_SETUP.md)
