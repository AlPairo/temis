# TASK_08 - HTTP Routes and SSE Protocol (API Parity)

## Objective

Expose Node routes matching the baseline contract and stream chat via SSE.

## Dependencies

- `TASK_07` completed.

## Files to Create/Update

- `backend-node/src/api/routes/chat.ts`
- `backend-node/src/api/routes/sessions.ts`
- `backend-node/src/api/routes/index.ts`

## Atomic Steps

- [ ] Implement `POST /chat/stream` with `text/event-stream`.
- [ ] Stream event types consistently (example: `token`, `done`, `error`, `meta`).
- [ ] Implement session endpoints:
  - `GET /sessions`
  - `GET /sessions/:id`
  - `DELETE /sessions/:id` (soft-delete conversation record; keep audit immutable)
- [ ] Add request validation via `zod`.
- [ ] Return baseline-compatible response fields from `TASK_01`.

## Validation

- [ ] Frontend can read stream incrementally with no buffering until end.
- [ ] Session list/detail/delete routes return expected JSON and status codes.
- [ ] Contract tests pass against `plan/contracts/chat-api-baseline.md`.

## Definition of Done

Node API can fully replace Python endpoints for chat and session management.

## Rollback / Recovery

Keep old Python service active until contract tests pass for both success and failure paths.
