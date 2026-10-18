-- Supabase Freeプランの活動状態を維持するハートビートテーブル
-- Supabaseダッシュボードの SQL Editor で一度だけ実行してください

CREATE TABLE IF NOT EXISTS project_keepalive (
  id SMALLINT PRIMARY KEY CHECK (id = 1),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE project_keepalive ENABLE ROW LEVEL SECURITY;

-- GitHub Actionsはservice_roleで書き込む。匿名・ログイン済み利用者には公開しない。
REVOKE ALL ON TABLE project_keepalive FROM anon, authenticated;
GRANT ALL ON TABLE project_keepalive TO service_role;

INSERT INTO project_keepalive (id, last_seen_at)
VALUES (1, NOW())
ON CONFLICT (id) DO UPDATE
SET last_seen_at = EXCLUDED.last_seen_at;

-- 確認用クエリ
SELECT id, last_seen_at FROM project_keepalive;