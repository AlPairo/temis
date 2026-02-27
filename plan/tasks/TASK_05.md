# TASK_05 - Singleton Infrastructure Clients

## Objective

Create singleton clients for Postgres, Redis, OpenAI, and Qdrant. Avoid per-request client creation.

## Dependencies

- `TASK_04` completed.

## Files to Create

- `backend-node/src/clients/postgres.ts`
- `backend-node/src/clients/redis.ts`
- `backend-node/src/clients/openai.ts`
- `backend-node/src/clients/qdrant.ts`

## Atomic Steps

- [ ] Implement one module per client exporting a lazily initialized singleton.
- [ ] Add connection lifecycle hooks for startup and graceful shutdown.
- [ ] Add timeout and retry settings (conservative defaults).
- [ ] Add lightweight health-check methods for each client.
- [ ] Ensure request handlers consume these modules (not new clients).

## Validation

- [ ] Logs show one initialization per process.
- [ ] Simulate multiple requests; verify no client creation spam.
- [ ] App shutdown closes open pools/connections cleanly.

## Definition of Done

Infrastructure client lifecycle is centralized and deterministic.

## Rollback / Recovery

If singleton pattern causes startup deadlock, temporarily disable lazy loading and initialize explicitly during boot.
