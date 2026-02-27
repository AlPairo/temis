# Add Analysis Toggle and Query Type Tracking

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` from the repository root.

## Purpose / Big Picture

Users need two chat modes. With Analysis OFF, the system should return only the retrieved RAG documents/snippets (no LLM answer). With Analysis ON, the system should keep the current behavior (RAG + LLM response). The backend must persist whether each request was a normal query or an analysis query so future tier limits can count them separately.

## Progress

- [x] (2026-02-26 00:00Z) Wrote plan/spec and locked product decisions (docs+citations for OFF, session-scoped toggle, default OFF, future counting on successful completions).
- [x] (2026-02-26 00:00Z) Implemented backend request flag, docs-only orchestration branch, and retrieval event query type persistence.
- [x] (2026-02-26 00:00Z) Implemented frontend session-scoped Analysis toggle and request payload wiring.
- [x] (2026-02-26 00:00Z) Updated backend/frontend tests and verification scripts for query mode and docs-only behavior.
- [x] (2026-02-26 00:00Z) Ran targeted backend/frontend tests and recorded outcomes.

## Surprises & Discoveries

- Observation: Existing `streamReply()` callers/tests rely on implicit current behavior (RAG + LLM). Changing the default to OFF affects tests and scripts that omit the new flag.
  Evidence: `backend-node/test/unit/services-data-chat-orchestrator.test.ts` and `backend-node/src/scripts/verify-task07.ts` call `streamReply()` without a mode flag.
- Observation: The AppHome session-scoped toggle test initially toggled the local draft session, not a persisted session, which caused a false-negative assertion when switching to `s-a`.
  Evidence: `frontend/src/pages/AppHome.test.tsx` failed until the test selected `s-a` before toggling.

## Decision Log

- Decision: Default `analysis_enabled` to `false`.
  Rationale: Matches future free-tier quota strategy and the approved plan decision.
  Date/Author: 2026-02-26 / Codex

- Decision: Persist query mode on `retrieval_events` as `query_type` with values `normal | analysis`.
  Rationale: Minimal additive schema change that supports future usage counting and analytics without changing route shape.
  Date/Author: 2026-02-26 / Codex

## Outcomes & Retrospective

Implemented the Analysis toggle end-to-end with default OFF semantics and a backend docs-only branch. The backend now persists retrieval query mode as `normal` or `analysis` on `retrieval_events.query_type`, and the frontend passes `analysis_enabled` in the existing SSE request body.

Targeted tests passed for backend route/orchestrator/repository and frontend chat service/AppHome/ChatView. Full-suite/integration coverage was not run in this pass.

## Context and Orientation

The backend streaming chat route lives in `backend-node/src/api/routes/chat.ts` and delegates to `backend-node/src/modules/chat/chat-orchestrator.ts`. The orchestrator currently always does three major steps: save the user message, retrieve RAG chunks, and stream an OpenAI answer. Retrieval events are stored in Postgres via `backend-node/src/modules/chat/chat-repository.ts` in the `retrieval_events` table.

The frontend sends the SSE request from `frontend/src/services/chat.ts`, manages session/chat state in `frontend/src/pages/AppHome.tsx`, and renders the chat UI in `frontend/src/components/ChatView.tsx`.

## Plan of Work

Add an optional `analysis_enabled` request field to the chat route schema and forward it to the orchestrator. Extend the orchestrator input and repository retrieval-event insert API to include query type. Add a docs-only branch in the orchestrator that formats retrieved chunks into a deterministic assistant message and skips the OpenAI call path entirely. Add a migration for `retrieval_events.query_type`.

On the frontend, add a session-scoped Analysis toggle in `ChatView`, hold its state in `AppHome`, and include the selected value in `streamChat()` request bodies.

Update backend and frontend tests to cover mode behavior and schema/payload propagation.

## Concrete Steps

From repo root:

1. Edit backend migration, repository, route, and orchestrator files.
2. Edit frontend chat service, page state, and chat view UI files.
3. Update unit/integration tests in `backend-node/test/**` and `frontend/src/**/*.test.tsx`.
4. Run targeted tests:
   - `backend-node`: `npm run test:unit -- services-data-chat-orchestrator.test.ts services-data-chat-repository.test.ts` (or equivalent Vitest file selection)
   - `backend-node`: `npm run test:unit -- routes/chat.test.ts`
   - `frontend`: `npm run test:run -- src/services/chat.test.ts src/pages/AppHome.test.tsx src/components/ChatView.test.tsx`

## Validation and Acceptance

Acceptance is met when:

- Sending a chat request with `analysis_enabled: false` returns an SSE `end` event with document snippets/citations and no token stream.
- Sending with `analysis_enabled: true` preserves token streaming and final assistant answer behavior.
- `retrieval_events` rows persist `query_type = 'normal'` or `query_type = 'analysis'`.
- Frontend toggle defaults OFF for a new session and remembers the setting per session while navigating.

## Idempotence and Recovery

The new migration is additive and idempotent (`IF NOT EXISTS`/guarded constraint creation). If a test fails mid-run, rerun after fixing code; no destructive recovery should be required beyond normal test DB reset flows already used in integration tests.

## Artifacts and Notes

Targeted test results:

- Backend: `npm.cmd run test:unit -- test/unit/services-data-chat-orchestrator.test.ts test/unit/services-data-chat-repository.test.ts test/routes/chat.test.ts` -> pass (`18` tests)
- Frontend: `npm.cmd run test:run -- src/services/chat.test.ts src/pages/AppHome.test.tsx src/components/ChatView.test.tsx` -> pass (`18` tests)

Frontend test execution required escalation in this environment because sandbox blocked `esbuild` child process spawn (`spawn EPERM`).

## Interfaces and Dependencies

Backend interfaces to exist after this change:

    type QueryType = "normal" | "analysis";

    interface ChatOrchestratorInput {
      analysisEnabled?: boolean;
      ...
    }

    appendRetrievalEvent(input: {
      conversationId: string;
      messageId?: string | null;
      userId?: string | null;
      query: string;
      queryType: QueryType;
      results: unknown;
    }): Promise<RetrievalEventRecord>;

Frontend `streamChat()` request payload must include:

    {
      session_id: string,
      message: string,
      analysis_enabled: boolean
    }
