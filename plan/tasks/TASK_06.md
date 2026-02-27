# TASK_06 - Qdrant Retriever and Citation Envelope

## Objective

Implement legal retrieval against existing Qdrant collection and standardize citations returned to the orchestrator.

## Dependencies

- `TASK_05` completed.

## Files to Create

- `backend-node/src/modules/rag/retriever.ts`
- `backend-node/src/modules/rag/types.ts`
- `backend-node/src/modules/rag/citation-builder.ts`

## Atomic Steps

- [ ] Define retrieval input:
  - `query`
  - optional filters (`jurisdiction`, `effective_date`, `source`)
  - `topK`
- [ ] Fetch embedding from OpenAI embedding model.
- [ ] Query Qdrant collection from env (`QDRANT_COLLECTION`).
- [ ] Map results to normalized structure:
  - `doc_id`, `chunk_id`, `text`, `score`, `metadata`
- [ ] Build citations array with stable IDs used in final response.
- [ ] Handle empty retrieval gracefully (no crash, low-confidence flag).

## Validation

- [ ] `retrieve()` returns expected shape for known query.
- [ ] Query with filter changes result set as expected.
- [ ] Retrieval latency logged and bounded for beta target.

## Definition of Done

Orchestrator can request context and receive normalized chunks plus citation objects.

## Rollback / Recovery

If Qdrant auth/URL fails, surface explicit health error and skip rollout.
