ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS external_id TEXT;

ALTER TABLE conversations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external_id_unique
  ON conversations(external_id);

CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at
  ON conversations(deleted_at);
