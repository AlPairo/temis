# Session Detail Citation Persistence for Stable References

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, chat references remain visible consistently for answers that already have retrieval citations, including after the session detail query refreshes or the page reloads. The user-visible result is that the `Referencias` panel and referenced-document buttons do not disappear after the first answer in a new session.

## Progress

- [x] (2026-02-26 20:15Z) Reproduced the issue in Playwright MCP: first response showed retrieved document excerpts but no references panel in the UI.
- [x] (2026-02-26 20:24Z) Identified root cause: `GET /sessions/:id` returns history with only `role` and `content`, so React Query session refresh overwrites locally appended citations.
- [x] (2026-02-26 20:31Z) Implemented backend session-detail hydration from `retrieval_events` into assistant message history (`citations`, `lowConfidence`) and stopped stripping those fields in the route response.
- [x] (2026-02-26 20:33Z) Added/updated backend tests covering citation persistence in repository and route response mapping.
- [x] (2026-02-26 20:34Z) Validated backend `test:unit` (140 passed) and `build`; reran Playwright MCP regression and confirmed references persist after reload and document download endpoint returns 200.

## Surprises & Discoveries

- Observation: The assistant response content persisted, but citation metadata disappeared almost immediately on the first turn because the session detail query became enabled and replaced local message state.
  Evidence: Playwright snapshot showed docs-only assistant text with extracted document/chunk lines but no `Referencias` panel after the first answer.

## Decision Log

- Decision: Fix this in the backend session-detail serialization instead of only patching frontend merge behavior.
  Rationale: References must survive reloads and any future client, not just transient local state in the current React app.
  Date/Author: 2026-02-26 / Codex.

## Outcomes & Retrospective

The root cause was not retrieval quality or SSE parsing. It was session-history persistence/serialization: the backend stored retrieval citations in `retrieval_events`, but `GET /sessions/:id` returned only `role` and `content`, so React Query refreshes replaced locally streamed assistant messages and removed citation metadata. The fix hydrates assistant messages with `citations` and `lowConfidence` from `retrieval_events` in `ChatRepository.getSessionById`, and the session route now preserves those fields in its response.

Validation proved the fix in real UI behavior, not just unit tests. Using Playwright MCP, a fresh first-turn docs-only answer showed `Referencias` immediately, the page was reloaded, the same session was reopened, and `Referencias` remained visible. The referenced document download button also triggered a successful `GET /documents/.../download` and downloaded the local file.

## Context and Orientation

The streaming chat endpoint (`backend-node/src/api/routes/chat.ts`) sends citations in the SSE `end` event. The frontend (`frontend/src/pages/AppHome.tsx`) appends that assistant message with citations, but it also keeps a session detail query active. Session detail data comes from `backend-node/src/api/routes/sessions.ts` via `ChatRepository.getSessionById` in `backend-node/src/modules/chat/chat-repository.ts`. Before this fix, that session detail history discarded `citations` and `lowConfidence`, causing references to disappear after a refresh.

## Plan of Work

Patch `ChatRepository.getSessionById` to read `retrieval_events` for the conversation and attach retrieval metadata to the matching assistant message (using the retrieval event's `message_id`, which points to the user message that triggered retrieval). Then patch `GET /sessions/:id` route serialization to preserve optional `citations` and `lowConfidence` fields instead of stripping them.

Add regression tests in `backend-node/test/unit/services-data-chat-repository.test.ts` and `backend-node/test/routes/sessions.test.ts`. Finally, validate with backend tests/build and Playwright MCP by reloading after a cited response.

## Concrete Steps

From repository root:

    cd backend-node
    npm.cmd run test:unit
    npm.cmd run build

Then run the app and verify in browser (Playwright MCP):

    1. Open http://localhost:5173/app
    2. Send a legal query that returns retrieved documents
    3. Confirm `Referencias` appears with cited items / referenced documents
    4. Reload the page
    5. Reopen the same session from the sidebar
    6. Confirm `Referencias` still appears for the same assistant message
    7. Click `Descargar documento` and confirm a file download occurs

## Validation and Acceptance

Acceptance is met when:

- A cited assistant answer shows `Referencias` in the UI.
- Reloading the page (or triggering a session detail refresh) does not remove that references panel.
- `backend-node` unit tests and TypeScript build pass.

## Idempotence and Recovery

The change is additive and safe to rerun. If citation hydration mis-associates retrieval metadata to assistant messages, revert only the new session-history hydration helper and route pass-through while keeping streaming citations unchanged.

## Artifacts and Notes

Primary regression scenario:

    First answer in a new session returns a docs-only assistant message.
    Session detail query becomes enabled and overwrites local message state.
    If session detail omits citations, `Referencias` disappears despite the answer being sourced.

Validation evidence (Playwright MCP):

    - `Referencias` and `Documentos referenciados` rendered on first answer
    - Reload + session reopen preserved the references panel
    - Network log: `GET /documents/<docId>/download => 200 OK`

## Interfaces and Dependencies

`ChatRepositoryPort.getSessionById` in `backend-node/src/modules/chat/chat-repository.ts` now returns session history entries that may include optional `citations` and `lowConfidence` fields (matching the frontend `ChatMessage` shape). `backend-node/src/api/routes/sessions.ts` must preserve those optional fields in the HTTP response.

Revision Note (2026-02-26): Created during implementation after Playwright reproduction of disappearing references, to track the backend session-detail citation persistence fix.
