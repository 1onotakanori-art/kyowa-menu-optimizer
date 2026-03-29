# Admin.js Supabase対応 - セットアップガイド

## 概要
admin.jsをGitHub API方式からSupabase方式に移行しました。

## 実施した変更

### 1. データフローの変更

**変更前（GitHub API方式）:**
- メニューデータ: `./menus/*.json` ファイルから取得
- 食事履歴保存: GitHub Personal Access Token を使ってプライベートリポジトリ `kyowa-menu-history` に直接書き込み
- 履歴読込: GitHub Pages 経由で取得

**変更後（Supabase方式）:**
- メニューデータ: Supabaseの`menus`テーブルから取得
- 食事履歴保存: Supabaseの`meal_history`テーブルに保存
- 履歴読込: Supabaseから取得
- ローカルストレージ: オフライン用に引き続き使用

### 2. 変更されたファイル

#### `/Users/onotakanori/Apps/kyowa-menu-optimizer/admin.js`
- ✅ Supabaseクライアント初期化を追加
- ✅ GitHub関連コードを削除（GITHUB_OWNER, GITHUB_REPO, GITHUB_TOKEN, saveToken, updateTokenStatus）
- ✅ `loadMenus()`: Supabaseの`menus`テーブルから取得
- ✅ `fetchHistoryFromSupabase()`: 新メソッド（従来の`fetchHistoryFromGitHub`を置き換え）
- ✅ `saveToSupabase()`: 新メソッド（従来の`saveToGitHub`を置き換え）
- ✅ `loadExistingHistory()`: Supabaseから取得

#### `/Users/onotakanori/Apps/kyowa-menu-optimizer/admin.html`
- ✅ Supabase CDNを追加
- ✅ GitHub Token設定セクションを削除

#### `/Users/onotakanori/Apps/kyowa-menu-optimizer/docs/MEAL_HISTORY_TABLE.sql`
- ✅ 新規作成: `meal_history`テーブルのDDL

## セットアップ手順

### ステップ1: Supabaseに`meal_history`テーブルを作成

1. [Supabase Dashboard](https://app.supabase.com/) にログイン
2. プロジェクトを開く
3. **SQL Editor** タブに移動
4. `/Users/onotakanori/Apps/kyowa-menu-optimizer/docs/MEAL_HISTORY_TABLE.sql` の内容を実行

#### テーブル構造

```sql
CREATE TABLE meal_history (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  day_of_week TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT 'ONO',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settings JSONB NOT NULL DEFAULT '{}',
  selected_menus JSONB NOT NULL DEFAULT '[]',
  totals JSONB NOT NULL DEFAULT '{}',
  achievement JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### ステップ2: RLS（Row Level Security）ポリシーの確認

`MEAL_HISTORY_TABLE.sql`には以下のポリシーが含まれています：

- ✅ 匿名ユーザーによる読み取り許可（フロントエンド用）
- ✅ 匿名ユーザーによる書き込み許可（admin.js用）

**セキュリティ上の注意:**
本番環境では、書き込みポリシーに認証を追加することを推奨します。

### ステップ3: 動作確認

1. `admin.html` を開く
2. 日付を選択して「メニュー読込」をクリック
3. メニューを選択して「保存」をクリック
4. Supabase Dashboard の **Table Editor** で `meal_history` テーブルを確認

### ステップ4: 既存データの移行（オプション）

GitHub の `kyowa-menu-history` リポジトリに既存データがある場合、手動で移行できます：

```javascript
// ブラウザのコンソールで実行
async function migrateHistoryFromGitHub(date) {
  // GitHubから取得
  const response = await fetch(`https://1onotakanori-art.github.io/kyowa-menu-history/data/history/${date}.json`);
  const data = await response.json();
  
  // Supabaseに保存
  const { error } = await _adminSupabaseClient
    .from('meal_history')
    .upsert({
      date: data.date,
      day_of_week: data.dayOfWeek,
      user_name: data.user,
      timestamp: data.timestamp,
      settings: data.settings,
      selected_menus: data.selectedMenus,
      totals: data.totals,
      achievement: data.achievement
    });
  
  if (error) console.error('移行エラー:', error);
  else console.log('移行成功:', date);
}

// 使用例
migrateHistoryFromGitHub('2026-01-13');
```

## トラブルシューティング

### エラー: `relation "meal_history" does not exist`

→ `MEAL_HISTORY_TABLE.sql` を実行してテーブルを作成してください。

### エラー: `new row violates row-level security policy`

→ RLSポリシーが正しく設定されているか確認してください（`MEAL_HISTORY_TABLE.sql`に含まれています）。

### メニューが読み込めない

→ `menus` テーブルにデータが存在するか確認してください：
```bash
node migrate-to-supabase.js
```

### 履歴が保存されない

→ ブラウザのコンソールでエラーを確認してください。Supabaseのanon keyが正しいか確認してください。

## 利点

### 変更前の課題
- ❌ GitHub Personal Access Tokenの管理が煩雑
- ❌ iOSでlocalStorageが使えない場合に設定できない
- ❌ GitHub API Rate Limitの制約
- ❌ プライベートリポジトリの管理が必要

### 変更後の利点
- ✅ トークン不要（Supabase anonキーで自動認証）
- ✅ リアルタイムアクセス
- ✅ スケーラブル（Supabaseのインフラ）
- ✅ データベース機能（検索、集計など）が使用可能

## 次のステップ

1. 認証機能の追加（Supabase Auth）
2. ユーザー別の記録管理
3. 統計・分析機能の追加
