ALTER TABLE retrieval_events
  ADD COLUMN IF NOT EXISTS query_type TEXT NOT NULL DEFAULT 'analysis';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'retrieval_events_query_type_check'
  ) THEN
    ALTER TABLE retrieval_events
      ADD CONSTRAINT retrieval_events_query_type_check
      CHECK (query_type IN ('normal', 'analysis'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_retrieval_events_user_id_created_at_query_type
  ON retrieval_events(user_id, created_at, query_type);
