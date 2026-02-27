# TASK_11 - Observability, Reliability, and Test Coverage

## Objective

Add logs, metrics, traces, and automated tests needed for safe beta operation.

## Dependencies

- `TASK_10` completed.

## Files to Create/Update

- `backend-node/src/observability/logger.ts`
- `backend-node/src/observability/metrics.ts`
- `backend-node/tests/` (integration and contract tests)
- `backend-node/README.md` operational commands

## Atomic Steps

- [ ] Add structured logs with correlation IDs (`request_id`, `conversation_id`).
- [ ] Add metrics:
  - request latency
  - stream duration
  - retrieval latency
  - OpenAI latency and token usage
  - error rates
- [ ] Add integration tests for:
  - happy-path stream
  - retrieval empty path
  - OpenAI error handling
  - session endpoints
- [ ] Add contract test suite against `plan/contracts/chat-api-baseline.md`.
- [ ] Add load smoke test script for concurrent chats (beta-scale target).

## Validation

- [ ] `npm test` passes in `backend-node`.
- [ ] Logs include IDs that allow tracing a full conversation.
- [ ] Metrics endpoint/report shows non-zero values during test run.

## Definition of Done

Team can diagnose failures quickly and regression risk is reduced by automated tests.

## Rollback / Recovery

If observability adds overhead, disable non-critical metrics first; keep error logging enabled.
