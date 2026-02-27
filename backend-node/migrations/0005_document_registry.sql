CREATE TABLE IF NOT EXISTS document_registry (
  doc_id TEXT PRIMARY KEY,
  canonical_url TEXT NOT NULL,
  display_name TEXT,
  source_label TEXT,
  mime_type TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  updated_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_document_registry_is_active
  ON document_registry(is_active);

CREATE INDEX IF NOT EXISTS idx_document_registry_updated_at
  ON document_registry(updated_at DESC);

