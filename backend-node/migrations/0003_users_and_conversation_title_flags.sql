CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('basic', 'supervisor', 'admin')),
  parent_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  display_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_parent_user_id ON users(parent_user_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS title_manual BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_conversations_user_id_deleted_at
  ON conversations(user_id, deleted_at);
