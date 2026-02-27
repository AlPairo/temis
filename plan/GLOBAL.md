# Node Migration ExecPlan: Legal Chat + RAG (Qdrant)

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This plan must be maintained in accordance with `PLANS.md` at repository root.

## Purpose / Big Picture

After this migration, users will chat with the legal assistant through a Node.js backend that streams responses token-by-token, stores immutable conversation audit records, and retrieves legal context from Qdrant (reusing existing indexed data). The visible result is faster, stable streaming chat with legal citations and traceability.

## Progress

- [~] (2026-02-21 23:13Z) TASK_03 implementation completed in code (`src/config/env.ts`, `src/config/index.ts`, `.env.example`) with centralized typed config and fail-fast env parsing; runtime validation is blocked in this environment because `npm.cmd install` fails with `EACCES`.
- [~] (2026-02-21 23:08Z) TASK_08 implementation completed in code (`chat` + `sessions` routes, SSE framing, session soft-delete), but validation remains blocked in this environment because backend dependencies are not installed and network-restricted installs fail.
- [~] (2026-02-21 23:08Z) TASK_04 implementation completed in code (schema + repositories + migration runner/check); runtime validation blocked by dependency install timeouts in current environment.
- [x] (2026-02-21 00:00Z) Captured architecture constraints from product discussion (OpenAI-only, streaming required, auditable history, continuously updated corpus, Qdrant as vector store).
- [x] (2026-02-21 00:00Z) Created initial global plan and atomic task files.
- [x] (2026-02-21 00:00Z) Created per-task sub-agent specs and logbooks under `plan/subagents/` with mandatory validation-gate completion policy.
- [x] (2026-02-21 23:08Z) Completed `TASK_06` by implementing `backend-node/src/modules/rag/retriever.ts`, `backend-node/src/modules/rag/types.ts`, and `backend-node/src/modules/rag/citation-builder.ts` with validation evidence in `plan/subagents/logs/TASK_06_LOG.md`.
- [~] (2026-02-21 23:13Z) Implemented `TASK_09` ingestion worker/queue/service/chunker and enqueue script in `backend-node/src/workers/` and `backend-node/src/modules/ingestion/`; completion blocked by environment inability to install backend dependencies and run runtime validation.
- [x] (2026-02-21 23:07Z) Completed `TASK_07` by implementing `backend-node/src/modules/chat/chat-orchestrator.ts`, `backend-node/src/modules/chat/prompt-builder.ts`, and `backend-node/src/modules/chat/types.ts`, plus verification evidence in `plan/subagents/logs/TASK_07_LOG.md`.
- [x] (2026-02-21 23:11Z) Completed `TASK_12` by authoring `plan/rollout-runbook.md` and `plan/cutover-checklist.md`, including staged rollout gates (A-E), one-click rollback command, canary comparison criteria, rollback drill evidence, and Python write-freeze/deprecation dates captured in `plan/subagents/logs/TASK_12_LOG.md`.
- [x] (2026-02-21 23:07Z) Implemented `TASK_10` frontend dual-backend integration in `frontend/src/api/client.ts`, `frontend/src/layouts/ChatLayout.tsx`, and `frontend/src/types/index.ts` with env-flag switching and citation rendering; final runtime validation remains blocked until `TASK_08` Node HTTP/SSE routes are present and runnable in this working tree.
- [ ] Execute `TASK_01` through `TASK_12` in order, updating this section at each stop.
- [ ] Production cutover completed and old Python chat path retired.

## Surprises & Discoveries

- Observation: Repository currently has a Python chat backend (`chat_service.py`) and a React frontend (`frontend/`), but no backend test suite.
  Evidence: File inspection and `rg` search found no backend test harness.
- Observation: Existing repo already contains local Qdrant data (`qdrant_data/`), which reduces migration risk for RAG retrieval.
  Evidence: `qdrant_data/collections/jurisprudencia/storage.sqlite` exists.

## Decision Log

- Decision: Keep Qdrant for v1 migration instead of moving to another vector store.
  Rationale: Existing indexed legal data already exists; avoids re-indexing cost for beta.
  Date/Author: 2026-02-21 / Codex.
- Decision: Use SSE (Server-Sent Events) for streaming v1, not WebSockets.
  Rationale: Simpler backend/client implementation with current one-way token streaming requirement.
  Date/Author: 2026-02-21 / Codex.
- Decision: Use a stateless Node API with external state (Postgres + Redis), not in-memory per conversation state.
  Rationale: Enables horizontal scaling and auditability.
  Date/Author: 2026-02-21 / Codex.
- Decision: Enforce one sub-agent per task with mandatory logging and test-pass completion gates.
  Rationale: Junior execution needs strict accountability; tasks must not be marked done without working validation.
  Date/Author: 2026-02-21 / Codex.

## Outcomes & Retrospective

Pending execution. Update after each milestone with: what shipped, what slipped, and why.

## Context and Orientation

Current backend is `chat_service.py` (FastAPI). Current frontend is `frontend/` (React + Vite + TypeScript). The migration introduces a new Node backend while preserving user-facing behavior. In this plan:

- "Orchestrator" means the backend module that coordinates retrieval, prompt assembly, OpenAI call, streaming, and persistence.
- "Audit trail" means append-only records of user input, retrieved documents/chunks, model settings, and model output.
- "SSE" means HTTP streaming where server pushes events (`text/event-stream`) and client reads incrementally.

Target structure to create:

- `backend-node/` for Node service and workers.
- `backend-node/src/api/` HTTP endpoints.
- `backend-node/src/modules/chat/` orchestration.
- `backend-node/src/modules/rag/` Qdrant retrieval and citation assembly.
- `backend-node/src/modules/audit/` immutable event writes.
- `backend-node/src/workers/` ingestion and re-index jobs.
- `backend-node/migrations/` SQL migrations.
- `plan/tasks/TASK_XX.md` execution guides for juniors.

## Plan of Work

Execute tasks in strict order. Each task is atomic and has clear acceptance criteria. No task should be merged unless its validation section passes.

1. Freeze behavior and define API parity with current Python service.
2. Scaffold Node service and baseline CI/lint/test tooling.
3. Define environment and configuration contracts.
4. Create durable storage schema for conversations, messages, retrieval events, and audits.
5. Implement Qdrant retrieval adapter and citation envelope.
6. Implement OpenAI streaming orchestrator and SSE endpoint.
7. Implement session CRUD parity endpoints.
8. Implement append-only audit and immutability rules.
9. Implement continuous ingestion workers and queue.
10. Integrate frontend with Node streaming path behind feature flag.
11. Add observability, SLO dashboards, and failure handling.
12. Execute staged rollout and finalize cutover/deprecation.

## Concrete Steps

From repository root, execute:

    mkdir plan
    mkdir plan\tasks

Then execute each task document:

    Start with: plan/tasks/TASK_01.md
    End with:   plan/tasks/TASK_12.md

For each task, the assigned junior must:

    1) Implement changes exactly as described.
    2) Run all required commands listed in task validation.
    3) Paste concise command outputs in PR description.
    4) Update this GLOBAL progress section with completion timestamp.

## Validation and Acceptance

Migration is accepted only when all conditions hold:

- Frontend streams assistant tokens from Node backend in real time.
- Qdrant retrieval returns legal citations and citations are attached to final answer.
- Conversation/audit data is persisted in Postgres as append-only records.
- Continuous ingestion jobs update Qdrant without interrupting chat traffic.
- Shadow/canary rollout shows no critical regression against baseline.

## Idempotence and Recovery

All migration steps are additive. If a task fails:

- Revert only that task branch/commit.
- Keep previous Python backend running as fallback.
- Retry after fixing root cause, then re-run validation commands.

No destructive operation is allowed without explicit backup steps documented in the corresponding task.

## Artifacts and Notes

Primary artifacts are the task files:

- `plan/tasks/TASK_01.md` through `plan/tasks/TASK_12.md`

Each task file contains exact scope, dependencies, commands, and acceptance evidence requirements.

## Interfaces and Dependencies

Required runtime dependencies for Node backend:

- Fast HTTP framework: `fastify`
- OpenAI SDK: `openai`
- PostgreSQL client and migrations: `pg` and chosen migration tool (`drizzle` or `knex`; standardize in `TASK_02`)
- Redis client: `ioredis`
- Qdrant client: `@qdrant/js-client-rest`
- Queue for workers: `bullmq`
- Validation/logging: `zod`, `pino`

Minimum core interfaces that must exist by end of migration:

    backend-node/src/modules/chat/chat-orchestrator.ts
      - streamReply(input: ChatRequestContext): AsyncGenerator<StreamEvent>

    backend-node/src/modules/rag/retriever.ts
      - retrieve(query: string, filters: RetrievalFilters): Promise<RetrievedChunk[]>

    backend-node/src/modules/audit/audit-repository.ts
      - appendEvent(event: AuditEvent): Promise<void>

    backend-node/src/api/routes/chat.ts
      - POST /chat/stream (SSE)
      - GET /sessions
      - GET /sessions/:id
      - DELETE /sessions/:id

Revision Note (2026-02-21): Initial version created to reflect Qdrant-based migration and to provide atomic junior-executable tasks.
Revision Note (2026-02-21): Added sub-agent governance model (`plan/subagents/`) requiring decision/work logs and successful validation before any task is marked completed.

