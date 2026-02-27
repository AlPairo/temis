# TASK_09 - Continuous Ingestion Worker (Queue + Qdrant Upserts)

## Objective

Implement background ingestion so legal corpus updates continuously without blocking chat requests.

## Dependencies

- `TASK_08` completed.

## Files to Create

- `backend-node/src/workers/ingestion-worker.ts`
- `backend-node/src/workers/queues.ts`
- `backend-node/src/modules/ingestion/ingestion-service.ts`
- `backend-node/src/modules/ingestion/chunker.ts`

## Atomic Steps

- [x] Create queue in Redis using BullMQ (`ingestion_jobs`).
- [x] Define job payload schema:
  - source identifier
  - document ID
  - raw content location/path
  - metadata
- [x] Implement pipeline per job:
  - fetch/read source
  - normalize text
  - chunk text
  - embed chunks via OpenAI
  - upsert vectors + payload metadata into Qdrant
- [x] Persist ingestion audit events (started/completed/failed).
- [x] Add dead-letter handling for failed jobs.

## Validation

- [ ] Enqueue one test job and confirm vectors appear/refresh in Qdrant.
- [ ] Failed job is retried and then moved to dead-letter after max attempts.
- [ ] Chat API remains responsive during ingestion load.

## Definition of Done

New legal documents can be added asynchronously and become retrievable.

## Rollback / Recovery

If ingestion corrupts data shape, pause worker, purge only affected document IDs, and replay jobs after fix.
