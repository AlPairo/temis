# TASK_01 - Freeze Current Behavior and Define Migration Contract

## Objective

Create an explicit contract document of the current Python chat behavior so the Node backend can match it before adding new features.

## Dependencies

- None. This is the first task.

## Files to Create

- `plan/contracts/chat-api-baseline.md`

## Atomic Steps

- [ ] Start Python backend locally:
  - `uv run uvicorn chat_service:app --reload --port 8000`
- [ ] Capture current API endpoints and payloads from `chat_service.py`:
  - `/sessions`
  - `/sessions/{session_id}`
  - `/sessions/{session_id}/summary`
  - delete session endpoint
  - chat/stream endpoint and SSE format
- [ ] Use `curl` or Postman to record one successful and one failed response per endpoint.
- [ ] Document exact request/response JSON shape, status codes, and SSE event formatting.
- [ ] Mark fields as `must keep`, `can extend`, `can deprecate later`.

## Validation

- [ ] `plan/contracts/chat-api-baseline.md` exists and is complete.
- [ ] Another developer can replay documented requests and get matching responses.

## Definition of Done

Contract is approved by tech lead and referenced in all subsequent PRs.

## Rollback / Recovery

No code changes; if inconsistent, rerun endpoint captures and update document.
