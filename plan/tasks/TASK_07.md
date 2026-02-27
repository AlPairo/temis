# TASK_07 - OpenAI Streaming Adapter and Chat Orchestrator

## Objective

Build orchestrator flow: receive user message, retrieve context, stream OpenAI response, and persist all events.

## Dependencies

- `TASK_06` completed.

## Files to Create

- `backend-node/src/modules/chat/chat-orchestrator.ts`
- `backend-node/src/modules/chat/prompt-builder.ts`
- `backend-node/src/modules/chat/types.ts`

## Atomic Steps

- [x] Define input type with `conversationId`, `userId` (if available), user text, and retrieval filters.
- [x] Build prompt with:
  - system guardrails (legal assistant behavior)
  - conversation history from Postgres
  - retrieved chunks/citations
- [x] Call OpenAI streaming API and expose async token stream.
- [x] Persist:
  - user message row
  - retrieval events
  - assistant final message
  - audit events (start, model call, completion/error)
- [x] On OpenAI failure, emit safe user-facing error event and audit it.

## Validation

- [x] Integration test confirms stream emits token chunks in order.
- [x] Postgres rows exist for each conversation turn.
- [x] Audit event count matches expected lifecycle.

## Definition of Done

A full end-to-end orchestrated response works from input to persisted output.

## Rollback / Recovery

If orchestration fails mid-stream, ensure partial state is marked failed in audit and request can be retried idempotently.
