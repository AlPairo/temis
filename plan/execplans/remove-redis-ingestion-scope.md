# Remove Redis and In-Repo Ingestion Pipeline from Node Backend Scope

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, the Node backend in `backend-node/` is focused on chat and retrieval only. Redis and the in-repo ingestion queue/worker pipeline are removed so local and production setup for this service no longer require queue infrastructure. The observable effect is that `/health` and `/infra/health` represent only chat/retrieval dependencies (Postgres, OpenAI, Qdrant/file-vector-store), and `backend-node/package.json` no longer contains ingestion worker scripts.

## Progress

- [x] (2026-02-25 00:00Z) Reviewed Redis and queue usage across `backend-node/src` and confirmed it is only used for ingestion workers/queues plus health/lifecycle checks.
- [x] (2026-02-25 00:00Z) Removed Redis from runtime lifecycle and infrastructure health checks.
- [x] (2026-02-25 00:00Z) Removed ingestion queue/worker modules and enqueue script from backend scope.
- [x] (2026-02-25 00:00Z) Updated config and env examples to eliminate `REDIS_URL`.
- [x] (2026-02-25 00:00Z) Static verification search confirms no remaining Redis/BullMQ/in-repo ingestion references in `backend-node/src` and `backend-node/package.json`.
- [ ] Validate build/runtime after dependencies are installed (blocked in current environment because `backend-node/node_modules` is missing).

## Surprises & Discoveries

- Observation: Redis was not part of the chat request path; it only backed BullMQ ingestion and appeared in infra-health/lifecycle because the service tried to health check all singleton clients.
  Evidence: `backend-node/src/workers/queues.ts`, `backend-node/src/workers/ingestion-worker.ts`, `backend-node/src/api/routes/infrastructure-health.ts`.

## Decision Log

- Decision: Remove ingestion worker/queue code from this service instead of leaving it dormant behind feature flags.
  Rationale: User explicitly runs ingestion separately and wants this project focused on chat + retrieval; removing queue code reduces operational and configuration surface.
  Date/Author: 2026-02-25 / Codex.
- Decision: Keep `APP_MODE=local|prod` support for retrieval backends (file vector store vs Qdrant server) while removing Redis entirely.
  Rationale: The mode switch still solves local testing without a Qdrant HTTP server and is directly relevant to retrieval.
  Date/Author: 2026-02-25 / Codex.

## Outcomes & Retrospective

Source refactor completed: Redis and in-repo ingestion queue/worker code were removed from `backend-node/src`, and health/lifecycle/config/package wiring now reflects a chat+retrieval-only backend. Runtime validation remains pending until `backend-node` dependencies are installed and the project is rebuilt.

## Context and Orientation

`backend-node/` is the Node backend introduced during a migration from the Python `chat_service.py`. Before this refactor, Redis (via `ioredis`) and BullMQ queues were used to run a background ingestion pipeline inside the same codebase. The user now wants ingestion handled outside this project, so this backend should only own:

- chat HTTP/SSE routes
- retrieval against Qdrant (or local file vector store in `APP_MODE=local`)
- persistence/audit for chat flows (Postgres)

The files that previously tied Redis into the service were `backend-node/src/clients/redis.ts`, `backend-node/src/workers/queues.ts`, `backend-node/src/workers/ingestion-worker.ts`, and `backend-node/src/scripts/enqueue-ingestion-job.ts`, plus health/lifecycle wiring and package scripts/dependencies.

## Plan of Work

Edit `backend-node/src/clients/lifecycle.ts` to stop importing and shutting down a Redis client. Edit `backend-node/src/api/routes/infrastructure-health.ts` to report only Postgres, OpenAI, and Qdrant. Edit `backend-node/src/config/env.ts` and `backend-node/.env.*` files to remove `REDIS_URL` from the configuration contract.

Then delete the Redis client implementation and all ingestion queue/worker modules (`src/clients/redis.ts`, `src/workers/*`, `src/modules/ingestion/*`, and `src/scripts/enqueue-ingestion-job.ts`). Finally, remove related npm scripts and dependencies (`worker:ingestion`, `enqueue:ingestion`, `bullmq`, `ioredis`) from `backend-node/package.json`, and remove leftover Redis env setup from local smoke scripts.

## Concrete Steps

From repository root:

    1. Edit backend runtime wiring and env contracts to remove Redis references.
    2. Delete ingestion queue/worker modules and enqueue script.
    3. Edit backend-node/package.json to remove queue scripts and Redis/BullMQ dependencies.
    4. Run a static search for `redis|bullmq|ingestion-worker|enqueue:ingestion`.

If `backend-node/node_modules` is available later, validate with:

    cd backend-node
    npm.cmd run build
    npm.cmd run dev
    curl http://localhost:3000/infra/health

Expected `/infra/health` result shape should no longer contain a `redis` key in `clients`.

## Validation and Acceptance

Acceptance is met when:

- `backend-node/package.json` has no `worker:ingestion` or `enqueue:ingestion` scripts.
- `backend-node/package.json` has no `bullmq` or `ioredis` dependency entries.
- `backend-node/src/api/routes/infrastructure-health.ts` returns health for Postgres/OpenAI/Qdrant only.
- `backend-node/src` contains no Redis or BullMQ imports.
- The service can start (once dependencies are installed) without requiring `REDIS_URL`.

## Idempotence and Recovery

This refactor is safe to repeat because it is subtractive. If a deleted ingestion path is later needed, restore it from version control or move it into a separate ingestion service/repository. If runtime validation fails after removal, check for stale imports using a repository-wide search for `redis`, `ioredis`, and `bullmq`.

## Artifacts and Notes

Key verification search after implementation:

    rg -n "redis|ioredis|bullmq|ingestion-worker|enqueue:ingestion|REDIS_URL" backend-node/src backend-node/package.json

The `backend-node/dist/` folder may remain stale until a fresh build is run; runtime validation should be performed after reinstalling dependencies and rebuilding.

## Interfaces and Dependencies

The backend should continue to expose:

- `backend-node/src/api/routes/health.ts`
- `backend-node/src/api/routes/infrastructure-health.ts`
- `backend-node/src/modules/chat/*`
- `backend-node/src/modules/rag/*`

The infrastructure health route in `backend-node/src/api/routes/infrastructure-health.ts` must continue to report a `clients` object with `postgres`, `openai`, and `qdrant`.

Revision Note (2026-02-25): Created to execute user-requested scope reduction that removes Redis and the in-repo ingestion queue/worker pipeline so this backend only handles chat and retrieval.
Revision Note (2026-02-25): Updated after implementation to record completed source-level removal and static verification results.
