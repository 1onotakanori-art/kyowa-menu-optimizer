-- 食事履歴テーブルの作成
-- Supabaseダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS meal_history (
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

-- インデックスの作成（検索高速化）
CREATE INDEX IF NOT EXISTS idx_meal_history_date ON meal_history(date);
CREATE INDEX IF NOT EXISTS idx_meal_history_user ON meal_history(user_name);

-- RLS（Row Level Security）の有効化
ALTER TABLE meal_history ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザーによる読み取りを許可（フロントエンドから読み込むため）
CREATE POLICY "Allow anonymous read access"
  ON meal_history
  FOR SELECT
  USING (true);

-- 匿名ユーザーによる書き込みを許可（admin.jsから保存するため）
-- 注: 本番環境では認証を追加することを推奨
CREATE POLICY "Allow anonymous insert/update"
  ON meal_history
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 更新時刻を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_meal_history_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 既存のトリガーがあれば削除してから作成（冪等性を確保）
DROP TRIGGER IF EXISTS meal_history_updated_at ON meal_history;
CREATE TRIGGER meal_history_updated_at
  BEFORE UPDATE ON meal_history
  FOR EACH ROW
  EXECUTE FUNCTION update_meal_history_updated_at();

-- 確認用クエリ
SELECT 
  'meal_history テーブルが正常に作成されました' AS status,
  COUNT(*) AS record_count 
FROM meal_history;
