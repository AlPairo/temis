# Markdown, Session Management, and AuthZ Session Scope

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, assistant responses in chat render as readable formatted Markdown, users can rename or logically delete their sessions, and session titles automatically become topic-like labels after the first user message. The backend also enforces real session visibility using JWT identity plus user hierarchy, so supervisors/admins can inspect sessions beneath them (including deleted-state visibility with a granular permission) while owner-only actions remain restricted.

## Progress

- [x] (2026-02-25 04:20Z) Created ExecPlan and aligned scope with user-approved decisions (JWT auth, recursive supervisor scope, owner-only rename/delete, markdown rendering, backend heuristic auto-titles).
- [x] (2026-02-25 04:42Z) Implemented backend auth foundations (JWT HS256 verification, role/permission mapping, users hierarchy recursive scope resolution, auth-aware session scope builder).
- [x] (2026-02-25 04:48Z) Implemented backend session API extensions (metadata-rich list/detail responses, logical deleted filtering, rename endpoint, owner/action flags, authz checks).
- [x] (2026-02-25 04:49Z) Implemented backend auto-title heuristic and wired it into `/chat/stream`, plus SSE `meta` event for session title updates.
- [x] (2026-02-25 04:59Z) Implemented frontend markdown rendering (local safe parser for headings/lists/links/code/tables) for assistant messages.
- [x] (2026-02-25 05:06Z) Implemented frontend session rename/delete UI and deleted/filter/scope controls, plus session service contract updates and SSE title meta handling.
- [x] (2026-02-25 05:08Z) Validation completed: `backend-node` TypeScript build passed; `frontend` `npx tsc --noEmit` passed.

## Surprises & Discoveries

- Observation: Backend currently has no auth middleware or user hierarchy persistence; frontend role/permission controls are UI-only mocks.
  Evidence: no `auth`/JWT middleware in `backend-node/src`, role checks exist only in `frontend/src/hooks/usePermission.ts`.
- Observation: `conversations` already has `title`, `user_id`, and `deleted_at`, which reduces session feature migration scope.
  Evidence: `backend-node/migrations/0001_initial.sql`, `backend-node/migrations/0002_conversation_sessions.sql`.
- Observation: Adding external markdown/JWT dependencies was not required to ship the requested behavior; a local markdown renderer and native `crypto` HS256 JWT verification were sufficient and avoided environment/package-install risk.
  Evidence: new files `frontend/src/components/MarkdownContent.tsx` and `backend-node/src/auth/jwt.ts`; no `package.json` dependency changes.
- Observation: Frontend session list and app shell both depended on the same sessions query, so adding filters/actions was easiest by moving filter state to `AppHome` and making `SessionList` presentational.
  Evidence: `frontend/src/pages/AppHome.tsx` now owns `sessionFilters`; `frontend/src/components/SessionList.tsx` receives `sessions`, `filters`, and callbacks as props.

## Decision Log

- Decision: Keep owner-only rename/delete in this implementation even for supervisors/admins, while allowing privileged visibility into subordinate sessions.
  Rationale: Matches requested plan scope and reduces risk of accidental destructive cross-user actions.
  Date/Author: 2026-02-25 / Codex.
- Decision: Implement markdown rendering locally (no dependency install assumption) if package install is unavailable, prioritizing common markdown and tables/code blocks.
  Rationale: Environment may block package installs; user-visible fix must not depend on new external downloads.
  Date/Author: 2026-02-25 / Codex.
- Decision: Implement JWT verification with native HS256 (`AUTH_JWT_SECRET`) in this milestone instead of a JWKS/RS256 client.
  Rationale: Keeps the feature fully functional and verifiable without adding dependencies, while preserving standard claims (`sub` + custom role claim) and issuer/audience checks.
  Date/Author: 2026-02-25 / Codex.
- Decision: Make JWT auth effectively opt-in by configuration (enabled when `AUTH_JWT_SECRET` is set), with route logic still supporting unauthenticated local/dev behavior when JWT is not configured.
  Rationale: Avoids breaking the existing local dev workflow immediately while allowing the real backend auth path to be enabled and tested in the same codebase.
  Date/Author: 2026-02-25 / Codex.

## Outcomes & Retrospective

The requested feature set is implemented end-to-end across backend and frontend: assistant messages render as formatted markdown, users can rename and logically delete sessions, session titles auto-populate from the first user message, and the backend now supports JWT-backed session visibility with supervisor/admin hierarchical reads and deleted-session permission gating.

The implementation intentionally uses native primitives (Node `crypto`, React rendering) instead of new external libraries, which reduced setup risk and kept the change self-contained. The main remaining operational step is applying the new backend migration and configuring JWT env values if the auth-enforced path should be enabled in the running environment.

## Context and Orientation

The backend Fastify app starts from `backend-node/src/server.ts` and is assembled in `backend-node/src/app.ts`. Session endpoints live in `backend-node/src/api/routes/sessions.ts`, chat streaming in `backend-node/src/api/routes/chat.ts`, and persistence in `backend-node/src/modules/chat/chat-repository.ts`. The database schema migrations are under `backend-node/migrations/`.

The frontend app shell is `frontend/src/pages/AppHome.tsx`, session list UI is `frontend/src/components/SessionList.tsx`, chat rendering is `frontend/src/components/ChatView.tsx`, and API wrappers are in `frontend/src/services/`.

## Plan of Work

First add backend foundations: JWT verification middleware, request auth context, user hierarchy storage/migration, and session authorization helpers. Then extend repository and routes to support session metadata (title/deleted/owner/action flags), privileged visibility, logical delete filtering, and a rename endpoint.

Next, add backend heuristic auto-title generation with a `title_manual` flag so manual names are never overwritten. Wire this into the chat stream flow on the first user message.

In parallel on the frontend, render assistant markdown and extend session APIs/UI for rename/delete/filter/scope and deleted-state display. Finally, validate builds and manual behavior and update this plan with evidence.

## Concrete Steps

From repository root:

    1. Add backend migration(s) for `users` and `conversations.title_manual`.
    2. Add backend auth/authz modules and wire them into `buildApp()` / session and chat routes.
    3. Extend `ChatRepository` and session routes for visibility, rename, and metadata.
    4. Add auto-title heuristic + chat route/orchestrator integration.
    5. Update frontend chat rendering for markdown and session UI/actions/services.
    6. Run `npm.cmd run build` in `backend-node` and `npx.cmd tsc --noEmit` in `frontend`, then validate in browser if possible.

## Validation and Acceptance

Acceptance is met when:

- Assistant markdown content (lists, code blocks, tables) renders formatted in chat.
- A user can rename and logically delete their own sessions from the UI.
- After the first message in a new session, the session title updates to a short topic-like label.
- Backend `GET /sessions` / `GET /sessions/:id` return title/deleted metadata and enforce JWT visibility rules.
- Supervisors/admins can view subordinate sessions in-scope, including deleted sessions only when the permission allows it.
- Backend and frontend type/build checks pass.

## Idempotence and Recovery

Migrations use additive `IF NOT EXISTS` patterns where possible. If auth integration breaks local development, a temporary fallback mode can be used only for health endpoints while keeping protected session/chat endpoints gated. UI changes are additive and can be rolled back independently from backend auth logic.

## Artifacts and Notes

Validation commands executed:

    cd backend-node
    npm.cmd run build

    cd frontend
    npx.cmd tsc --noEmit

Key implementation files:

    backend-node/migrations/0003_users_and_conversation_title_flags.sql
    backend-node/src/auth/jwt.ts
    backend-node/src/auth/service.ts
    backend-node/src/api/routes/sessions.ts
    backend-node/src/api/routes/chat.ts
    backend-node/src/modules/chat/chat-repository.ts
    backend-node/src/modules/chat/session-title.ts
    frontend/src/components/MarkdownContent.tsx
    frontend/src/components/ChatView.tsx
    frontend/src/components/SessionList.tsx
    frontend/src/pages/AppHome.tsx
    frontend/src/services/chat.ts
    frontend/src/services/sessions.ts

## Interfaces and Dependencies

Backend will add request auth context and session authorization helpers, plus repository methods for viewer-scoped session listing and renaming. Frontend session service types will expand to include `title`, deleted status, and action flags. Chat assistant rendering in `frontend/src/components/ChatView.tsx` will route assistant messages through a markdown renderer component.

Revision Note (2026-02-25): Created to implement the approved plan for markdown chat rendering, session rename/delete/titleing, and backend JWT-based session visibility authorization.
Revision Note (2026-02-25): Updated after implementation to record the shipped backend/frontend changes, HS256 JWT implementation choice, and validation results.
