# TASK_10 - Frontend Integration with Node Streaming Backend

## Objective

Switch frontend API calls from Python backend to Node backend with a feature flag and preserve UX.

## Dependencies

- `TASK_08` completed (and `TASK_09` optional for ingestion-related views).

## Files to Update

- `frontend/src/api/client.ts`
- `frontend/src/layouts/ChatLayout.tsx`
- `frontend/src/types/index.ts`

## Atomic Steps

- [x] Add `VITE_CHAT_API_BASE_URL` and `VITE_USE_NODE_BACKEND` env flags.
- [x] Update API client to support new SSE endpoint and event shape.
- [x] Keep fallback path to old endpoint while flag is off.
- [x] Ensure partial token rendering remains smooth.
- [x] Display retrieval citations in final assistant message block.
- [x] Add user-facing error state for stream interruptions.

## Validation

- [ ] With flag off, existing flow works unchanged.
- [ ] With flag on, messages stream from Node backend and render incrementally.
- [ ] Session list/detail/delete still works in UI.

## Definition of Done

Frontend supports dual backend mode and is ready for canary rollout.

## Rollback / Recovery

Set feature flag off to instantly revert frontend traffic to old backend.
