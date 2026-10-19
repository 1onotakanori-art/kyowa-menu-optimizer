# AI 推奨 クイックスタート

食事記録から好みを学習し、AI タブに表示する推奨セットを作る手順です。ふだんは週次処理（`npm run weekly:prepare` → Cowork の解析 → `npm run weekly:finish`）が自動で行うので、ここに書いた手動の手順は、すぐに反映したいときや調子を確認したいときに使います。

## 前提

- Supabase の `menus`、`meal_history`、`ai_selections` テーブルが作成済み（定義は [supabase/schema/](../supabase/schema/)）
- Python 3.9 以上
- 環境変数 `SUPABASE_SERVICE_KEY` が設定済み

## セットアップ（初回のみ）

```bash
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux
pip install -r requirements.txt
```

`npm run ml:*` などの npm スクリプトは、`scripts/run-python.js` が `.venv` の Python を自動で選ぶので、仮想環境を有効にしなくても動きます。

接続の確認:

```bash
npm run py -- ml/supabase_data_loader.py
```

## 手動で反映する手順

1. **食事記録を保存する**: 管理画面（`/admin`）で食べたメニューを記録する（[ADMIN_SETUP.md](ADMIN_SETUP.md)）
2. **モデルを再学習する**:
   ```bash
   npm run ml:retrain
   ```
   学習済みモデルは `ml/model/menu_recommender.pkl` に保存されます。
3. **AI 推奨を作り直す**:
   ```bash
   npm run ml:regen
   ```
   結果は Supabase の `ai_selections` に保存され、AI タブはそこから読みます。デプロイや git push は必要ありません。

新しいメニューの Claude 解析も含めて一通り回したいときは `npm run ml:weekly`、事前に件数と費用だけ確認したいときは `npm run ml:dry-run` を使います。

## データの流れ

```
管理画面（/admin）──保存──> Supabase meal_history
                          │
                          ▼
              ml/menu_recommender.py（学習） ──> ml/model/menu_recommender.pkl
                          │
                          ▼
              ml/generate_ai_selections.py（推奨の作成。メニューは menus/ から読む）
                          │
                          ▼
                 Supabase ai_selections ──> AI タブ・ダッシュボード（web/）
```

## トラブルシューティング

| 症状 | 確認すること |
|---|---|
| 「supabase-py パッケージがインストールされていません」 | `pip install -r requirements.txt` を実行する |
| 「Supabaseにデータがありません」 | 管理画面（`/admin`）で食事記録を保存したか、Supabase の `meal_history` に行があるか。最低3日分は必要 |
| 「モデルが見つかりません」 | `npm run ml:retrain` でモデルを作る |
| 「メニューファイルが見つかりません」 | `menus/menus_YYYY-MM-DD.json` があるか。なければ `npm run scrape` |
| AI タブに何も出ない | Supabase の `ai_selections` にその日付の行があるか。なければ `npm run ml:regen` |

## よくある質問

**学習にどのくらいのデータが必要？**
最低3日分の食事記録で学習できます。精度を上げるには10日分以上をおすすめします。

**学習にかかる時間は？**
データ量にもよりますが、数秒〜1分程度です。

**Supabase を使わずに学習したい**
`menu_recommender.py` の `load_data()` をローカルファイルで呼び出します。

```python
recommender.load_data(use_supabase=False, data_path='data/training_data.json')
```
