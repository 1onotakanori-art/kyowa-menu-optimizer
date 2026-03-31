-- AI推薦メニューテーブルの作成
-- Supabaseダッシュボードの SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS ai_selections (
  id BIGSERIAL PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  date_label TEXT NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  selected_menus JSONB NOT NULL DEFAULT '[]',
  all_menus_with_scores JSONB NOT NULL DEFAULT '[]',
  model_info JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- インデックスの作成（検索高速化）
CREATE INDEX IF NOT EXISTS idx_ai_selections_date ON ai_selections(date);

-- RLS（Row Level Security）の有効化
ALTER TABLE ai_selections ENABLE ROW LEVEL SECURITY;

-- 匿名ユーザーによる読み取りを許可（フロントエンドから読み込むため）
CREATE POLICY "Allow anonymous read access"
  ON ai_selections
  FOR SELECT
  USING (true);

-- 匿名ユーザーによる書き込みを許可（generate_ai_selections.pyから保存するため）
-- 注: 本番環境では認証を追加することを推奨
CREATE POLICY "Allow anonymous insert/update"
  ON ai_selections
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 更新時刻を自動更新するトリガー
CREATE OR REPLACE FUNCTION update_ai_selections_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS ai_selections_updated_at ON ai_selections;
CREATE TRIGGER ai_selections_updated_at
  BEFORE UPDATE ON ai_selections
  FOR EACH ROW
  EXECUTE FUNCTION update_ai_selections_updated_at();

-- 確認用クエリ
SELECT 
  'ai_selections テーブルが正常に作成されました' AS status,
  COUNT(*) AS record_count 
FROM ai_selections;
