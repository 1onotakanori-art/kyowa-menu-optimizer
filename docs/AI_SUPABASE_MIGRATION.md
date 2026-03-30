# AIタブ Supabase対応 完了レポート

## 概要

AIタブの学習データ取得方式を、ローカルファイルベースからSupabase直接読み取り方式に変更しました。

## 変更内容

### 1. 新規作成ファイル

#### `ml/supabase_data_loader.py`
- Supabaseの`meal_history`テーブルから学習データを直接取得
- 機械学習モデルの学習に必要な形式に自動変換
- 統計情報の取得機能を提供

**主な機能:**
- `get_meal_history()`: 食事履歴をSupabaseから取得
- `get_training_data()`: 学習データ形式で取得
- `get_statistics()`: データ統計情報を取得

#### `requirements.txt`
- Python依存関係を明記
- `supabase>=2.0.0`を追加

### 2. 更新ファイル

#### `ml/menu_recommender.py`
**変更点:**
- `load_data()`メソッドにSupabase対応を追加
- `use_supabase=True`パラメータでSupabaseから学習データを取得
- ローカルファイルへのフォールバック機能を維持

**使用方法:**
```python
recommender = MenuRecommender()
recommender.load_data(use_supabase=True)  # Supabaseから取得
# または
recommender.load_data(use_supabase=False)  # ローカルファイルから取得
```

#### `ml/generate_ai_selections.py`
**変更点:**
- ドキュメントを更新し、Supabase対応を明記
- エラーメッセージを改善し、使用手順を追加

## 新しいワークフロー

### 従来の方式（廃止予定）
```
1. sync-training-data.js を実行してGitHubリポジトリからダウンロード
2. python ml/menu_recommender.py で学習
3. python ml/generate_ai_selections.py でAI推薦生成
```

### 新しい方式（Supabase対応）
```
1. admin.htmlで食事記録を保存（自動的にSupabaseに保存）
2. python ml/menu_recommender.py で学習（Supabaseから自動取得）
3. python ml/generate_ai_selections.py でAI推薦生成
```

## 利点

### 1. シンプルなワークフロー
- `sync-training-data.js`の実行が不要
- GitHubリポジトリの管理が不要
- データ同期の手間を削減

### 2. リアルタイム性
- 食事記録を保存すると即座にSupabaseに反映
- 最新のデータで学習可能
- タイムラグなし

### 3. 一元管理
- すべてのデータがSupabaseに集約
- バックアップや管理が容易
- データの整合性が保たれる

### 4. スケーラビリティ
- データ量が増えても対応可能
- Supabaseの高速クエリを活用
- 必要に応じてデータフィルタリング可能

## テスト結果

### Supabaseデータローダーのテスト
```
✅ Supabaseクライアント初期化完了
✅ 5件の食事履歴を取得しました
✅ 5日分の学習データを準備しました

統計情報:
- 総日数: 5日
- 総メニュー数: 198件
- 総選択数: 11件
- 1日平均選択数: 2.2件
- 期間: 2026-03-30 〜 2026-04-03
```

## 使用方法

### 1. 環境セットアップ
```bash
# Python依存関係をインストール
pip install -r requirements.txt
```

### 2. データ取得テスト
```bash
# Supabaseデータローダーをテスト
python ml/supabase_data_loader.py
```

### 3. モデル学習（Supabaseから自動取得）
```bash
# 学習データをSupabaseから取得して学習
python ml/menu_recommender.py
```

### 4. AI推薦生成
```bash
# 学習済みモデルでAI推薦を生成
python ml/generate_ai_selections.py
```

### 5. GitHubにプッシュ
```bash
git add docs/ai-selections/
git commit -m "Update AI selections with Supabase data"
git push
```

## 注意事項

### Supabase接続情報
- URL: `https://zzleqjendqkoizbdvblw.supabase.co`
- 匿名キー: コード内にハードコード（GitHub Pagesと同じ）
- **セキュリティ**: 本番環境では環境変数での管理を推奨

### データ要件
- `meal_history`テーブルに少なくとも1件の履歴が必要
- 各日付に対応する`menus/menus_YYYY-MM-DD.json`ファイルが必要

### フォールバック機能
- Supabaseが利用できない場合、自動的にローカルファイルモードに切り替え
- `data/training_data.json`が必要

## 今後の拡張

### 1. データ取得の最適化
- 日付範囲指定での取得
- キャッシュ機能の追加
- 増分学習のサポート

### 2. モデル管理
- モデルバージョン管理
- A/Bテストのサポート
- オンライン学習の検討

### 3. UI統合
- フロントエンドから直接Supabaseアクセス
- リアルタイム推薦の実装
- パフォーマンスの最適化

## 削除可能なファイル（オプション）

以下のファイルは新しい方式では不要ですが、互換性のために残しておくことを推奨:
- `sync-training-data.js` - ローカルファイルバックアップ用に保持
- `data/training_data.json` - フォールバック用に保持

## 完了日
2026年3月31日

## 担当
GitHub Copilot AI Assistant
