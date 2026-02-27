# Chat UX Feedback and Session Observability Fixes

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, the chat feels responsive and trustworthy during streaming: pressing Enter sends messages, the UI shows progress text while the backend works, and users receive a clear Spanish fallback message when infrastructure dependencies fail. Additionally, session retrieval logs include a concrete `conversation_id` instead of `null`, improving observability for support and debugging.

## Progress

- [x] (2026-02-25 02:40Z) Split the user request into frontend UX, streaming feedback, backend SSE error handling, session logging, and styling tasks.
- [x] (2026-02-25 02:41Z) Parallel exploration completed for frontend and backend target files/functions.
- [x] (2026-02-25 02:45Z) Implemented Enter-to-send behavior in `frontend/src/components/ChatView.tsx` with Shift+Enter preserved for newline.
- [x] (2026-02-25 02:49Z) Implemented streaming progress/status placeholder draft updates and persistent localized frontend error message fallback in `frontend/src/pages/AppHome.tsx` and `frontend/src/services/chat.ts`.
- [x] (2026-02-25 02:53Z) Mapped infrastructure failures to a generic Spanish safe message in backend orchestration and route-level SSE/bootstrap error handling.
- [x] (2026-02-25 02:54Z) Surfaced repository conversation UUID to `/sessions/:id` logging so `conversation_id` can be populated.
- [x] (2026-02-25 02:55Z) Improved “Sesiones” heading styling consistency in sidebar and landing preview via shared `.session-heading` class in theme styles.
- [x] (2026-02-25 02:58Z) Validation completed: `backend-node` TypeScript build passed; `frontend` `npx tsc --noEmit` passed; `frontend` `vite build` blocked by sandbox `spawn EPERM`.

## Surprises & Discoveries

- Observation: `sessions.get` logs already pass `sessionId`, but the logger emits `conversation_id` from `context.conversationId`, so `conversation_id` remains `null` unless the route provides the internal conversation UUID.
  Evidence: `backend-node/src/api/routes/sessions.ts`, `backend-node/src/observability/logger.ts`.
- Observation: `frontend` production build (`vite build`) could not run in the current sandbox because `esbuild` process spawning is blocked (`spawn EPERM`), but standalone TypeScript checking succeeded.
  Evidence: `npm.cmd run build` in `frontend/` failed at Vite config loading with `Error: spawn EPERM`; `npx.cmd tsc --noEmit` in `frontend/` exited successfully.

## Decision Log

- Decision: Implement backend and frontend error messaging together, but keep the generic Spanish fallback generated in backend SSE handling and reinforced in frontend parsing.
  Rationale: Backend guarantees consistent messaging for all clients; frontend fallback still protects against network-level failures and malformed responses.
  Date/Author: 2026-02-25 / Codex.
- Decision: Keep fake progress updates in the existing `assistantDraft` path instead of introducing a new message type/state machine.
  Rationale: Minimizes risk and code churn while producing the requested “algo está pasando” perception.
  Date/Author: 2026-02-25 / Codex.

## Outcomes & Retrospective

Requested chat UX and observability fixes were implemented across frontend and backend. The chat now supports Enter-to-send, shows staged progress text before tokens arrive, and presents a generic Spanish service error message for infrastructure/network failures instead of raw `fetch failed`. Backend SSE error handling now maps infra failures to the same style of safe message, and `/sessions/:id` logs include the internal conversation UUID so `conversation_id` is no longer `null` for existing sessions.

Validation is strong but not fully end-to-end in this sandbox: `backend-node` TypeScript build passed and `frontend` TypeScript checking passed, while `frontend` `vite build` was blocked by sandbox process-spawn restrictions rather than code errors.

## Context and Orientation

The frontend app lives in `frontend/src/`. The chat send/stream flow is handled by `frontend/src/pages/AppHome.tsx` using `frontend/src/services/chat.ts`. The visual input is rendered in `frontend/src/components/ChatView.tsx` with `frontend/src/components/ui/Textarea.tsx`.

The backend SSE chat route is in `backend-node/src/api/routes/chat.ts`, which streams events from `backend-node/src/modules/chat/chat-orchestrator.ts`. Session retrieval for `/sessions/:id` is implemented in `backend-node/src/api/routes/sessions.ts` and uses `backend-node/src/modules/chat/chat-repository.ts`.

The logging layer in `backend-node/src/observability/logger.ts` emits `conversation_id` from request context, so routes must provide `conversationId` explicitly when they know it.

## Plan of Work

First, update the frontend chat input so Enter submits the form and Shift+Enter continues to insert a newline. Then improve the frontend streaming UX by showing rotating progress text in `assistantDraft` until real tokens arrive, and persist a Spanish fallback assistant message when streaming fails.

Next, update backend SSE error handling to detect infrastructure failures (OpenAI, Qdrant, Postgres, retriever health) and emit a generic Spanish message to the client while keeping detailed errors in logs. After that, extend the session repository detail type to include the internal conversation UUID and use it in the `/sessions/:id` log context.

Finally, adjust the “Sesiones” heading typography in the sidebar and landing preview so it matches the app’s visual language.

## Concrete Steps

From repository root:

    1. Edit frontend chat input/components to handle Enter key submission.
    2. Edit frontend chat page/service to add stream progress messages and localized fallback error handling.
    3. Edit backend chat orchestrator/route to map infra failures to a generic Spanish SSE error message.
    4. Edit backend chat repository + session route to surface and log `conversation_id`.
    5. Edit sidebar/landing “Sesiones” heading styles.
    6. Run targeted validation (TypeScript build/tests or static searches) and record results.

## Validation and Acceptance

Acceptance is met when:

- Pressing Enter in the chat input sends the message, while Shift+Enter inserts a newline.
- After sending a message, the user sees progress text (for example, “Procesando…” / “Analizando petición…”) before the real assistant tokens arrive.
- If backend dependencies fail (OpenAI, Qdrant, Postgres or similar), the user receives a generic Spanish error message rather than a raw “fetch failed”.
- Logs for `sessions.get` include a non-null `conversation_id` when the session exists.
- The “Sesiones” heading looks improved and consistent in both the sidebar and landing preview.

## Idempotence and Recovery

These changes are safe to reapply because they are additive/refinement edits. If the progress-message UX causes regressions, remove only the timer-based draft updates and keep the Enter submission and error-message fixes. If backend SSE messaging breaks streaming, revert the new error-mapping helper while preserving detailed logs.

## Artifacts and Notes

Planned verification commands (subject to available dependencies/scripts):

    rg -n "conversationId|sessions.get|event: error|assistantDraft|Sesiones" backend-node/src frontend/src
    cd frontend && npm.cmd run build
    cd backend-node && npm.cmd run build

## Interfaces and Dependencies

Backend route `backend-node/src/api/routes/chat.ts` must continue emitting SSE events compatible with the existing frontend `streamChat` parser. `ChatRepositoryPort.getSessionById` in `backend-node/src/modules/chat/chat-repository.ts` will be extended so the returned session detail includes the internal conversation UUID used for observability (`conversationId: string`).

Revision Note (2026-02-25): Created to execute user-requested chat UX feedback improvements, generic infrastructure error messaging, and `conversation_id` logging fixes across frontend and backend.
Revision Note (2026-02-25): Updated after implementation to record completed tasks, validation outcomes, and the frontend build sandbox limitation (`spawn EPERM`).
