-- Run this while connected to the `pichufy` database.
-- This script combines the backend migrations (`0001_initial.sql` + `0002_conversation_sessions.sql`).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  user_id TEXT,
  title TEXT,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  user_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retrieval_events (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE RESTRICT,
  message_id UUID REFERENCES messages(id) ON DELETE SET NULL,
  user_id TEXT,
  query TEXT NOT NULL,
  results JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_events (
  id BIGSERIAL PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  user_id TEXT,
  event_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_external_id_unique
  ON conversations(external_id);
CREATE INDEX IF NOT EXISTS idx_conversations_created_at
  ON conversations(created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user_id
  ON conversations(user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_deleted_at
  ON conversations(deleted_at);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
  ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at
  ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_id
  ON messages(user_id);

CREATE INDEX IF NOT EXISTS idx_retrieval_events_conversation_id
  ON retrieval_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_retrieval_events_created_at
  ON retrieval_events(created_at);
CREATE INDEX IF NOT EXISTS idx_retrieval_events_user_id
  ON retrieval_events(user_id);

CREATE INDEX IF NOT EXISTS idx_audit_events_conversation_id
  ON audit_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at
  ON audit_events(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_user_id
  ON audit_events(user_id);

CREATE OR REPLACE FUNCTION reject_mutation_on_append_only_tables()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only. % operations are not allowed.', TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_messages_immutable ON messages;
CREATE TRIGGER trg_messages_immutable
  BEFORE UPDATE OR DELETE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION reject_mutation_on_append_only_tables();

DROP TRIGGER IF EXISTS trg_retrieval_events_immutable ON retrieval_events;
CREATE TRIGGER trg_retrieval_events_immutable
  BEFORE UPDATE OR DELETE ON retrieval_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_mutation_on_append_only_tables();

DROP TRIGGER IF EXISTS trg_audit_events_immutable ON audit_events;
CREATE TRIGGER trg_audit_events_immutable
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION reject_mutation_on_append_only_tables();

