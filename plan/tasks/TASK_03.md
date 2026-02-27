# TASK_03 - Configuration and Environment Contract

## Objective

Centralize environment handling and validate required secrets at startup.

## Dependencies

- `TASK_02` completed.

## Files to Create

- `backend-node/src/config/env.ts`
- `backend-node/src/config/index.ts`
- Update `backend-node/.env.example`

## Atomic Steps

- [ ] Define env schema using `zod` with required keys:
  - `PORT`
  - `OPENAI_API_KEY`
  - `OPENAI_MODEL`
  - `POSTGRES_URL`
  - `REDIS_URL`
  - `QDRANT_URL`
  - `QDRANT_API_KEY` (optional if local)
  - `QDRANT_COLLECTION`
- [ ] Fail fast on invalid/missing required values with readable error.
- [ ] Export typed config object for all modules.
- [ ] Document each variable in `.env.example` with one-line meaning.

## Validation

- [ ] Running without required env fails with explicit startup error.
- [ ] Running with valid env starts successfully.

## Definition of Done

All modules read configuration only through `src/config`.

## Rollback / Recovery

If any variable name changes, update `.env.example` and startup docs in same PR.
