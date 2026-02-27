# Frontend Vitest Test Suite

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` at the repository root and must be maintained in accordance with that file.

## Purpose / Big Picture

This change adds a practical frontend test suite for `frontend/` so contributors can verify service logic, permissions/state behavior, key component interactions, and the main `AppHome` orchestration flow without manual browser checks. After this change, running `npm.cmd run test:run` in `frontend/` executes a deterministic suite, and `npm.cmd run test:coverage` produces a coverage report without enforcing thresholds.

## Progress

- [x] (2026-02-25 20:22Z) Confirmed existing frontend already uses Vitest + JSDOM and has one test (`src/hooks/usePermission.test.tsx`).
- [x] (2026-02-25 20:24Z) Added test infrastructure improvements (`src/test/setup.ts`, provider/render helpers, query client helper, fixture builders, fetch/SSE helpers).
- [x] (2026-02-25 20:28Z) Added service/state/hook test suites for `http`, `sessions`, `chat`, `user-store`, and expanded `usePermission`.
- [x] (2026-02-25 20:29Z) Added component tests for `ChatView` and `SessionList`.
- [x] (2026-02-25 20:30Z) Added `AppHome` integration tests using mocked child components/services to validate orchestration.
- [x] (2026-02-25 20:30Z) Ran `npm.cmd run test:run` and fixed initial failing test assumptions (query ambiguity, rename button selection, AppHome trimming assumption).
- [x] (2026-02-25 20:31Z) Added `test:run` and `test:coverage` scripts plus Vitest coverage configuration (report-only).
- [x] (2026-02-25 20:31Z) Installed `@vitest/coverage-v8` and updated `frontend/package-lock.json`.
- [x] (2026-02-25 20:32Z) Validated `npm.cmd run test:coverage` and recorded coverage output.

## Surprises & Discoveries

- Observation: Running frontend Vitest inside the sandbox fails before tests start because `esbuild` cannot spawn.
  Evidence: `Error: spawn EPERM` while loading `vite.config.ts`; resolved by running test commands outside the sandbox.

- Observation: `AppHome` renders both mobile and desktop trees simultaneously in JSDOM because CSS classes do not hide DOM nodes in tests.
  Evidence: Querying child UI directly would duplicate `SessionList` and `ChatView`; tests were stabilized by mocking child components and inspecting passed props.

- Observation: Some frontend strings are mojibake/corrupted (for example `tÃ©cnico`, `sesiÃ³n`), which makes exact string assertions brittle.
  Evidence: Source files such as `src/services/chat.ts`, `src/pages/appHomeText.ts`, and `src/services/sessions.ts` contain encoded artifacts; tests were written to assert behavior and stable substrings where appropriate.

- Observation: `SessionList`’s delete button accessible name includes the session title, which can collide with the main row button query when matching loosely.
  Evidence: `/Sesion uno/i` matched both the row button and `Eliminar sesión Sesion uno`; fixed by anchoring the query (`/^Sesion uno\b/i`).

## Decision Log

- Decision: First pass uses Vitest + React Testing Library only, without Playwright/Cypress.
  Rationale: The requested scope prioritized fast unit/component/page tests and faster implementation over browser E2E setup.
  Date/Author: 2026-02-25 / Codex

- Decision: Coverage is configured in report-only mode (`v8` provider, no thresholds).
  Rationale: Establishes visibility immediately without blocking contributors while coverage grows.
  Date/Author: 2026-02-25 / Codex

- Decision: Service tests use local `fetch` stubs and module mocks instead of introducing MSW.
  Rationale: Keeps setup minimal and aligned with current codebase size/complexity.
  Date/Author: 2026-02-25 / Codex

- Decision: `AppHome` tests mock `SessionList`, `ChatView`, and service modules and assert prop-level orchestration.
  Rationale: Avoids duplicate mobile/desktop DOM ambiguity and keeps the tests focused on page logic (React Query + callback wiring).
  Date/Author: 2026-02-25 / Codex

- Decision: Added shared helpers under `frontend/src/test/` (`render`, `query-client`, `factories`, `fetch-mocks`) before expanding suites.
  Rationale: Prevents repetitive boilerplate and keeps later tests small and consistent.
  Date/Author: 2026-02-25 / Codex

## Outcomes & Retrospective

The frontend now has a meaningful automated test suite covering service behavior, streaming/SSE parsing, Zustand state, permission hooks, two key interactive components, and the `AppHome` orchestration flow. The suite is fast enough for local iteration and includes a working coverage command with report output.

Gaps remain by design: there are no browser E2E tests yet, and many presentational components/pages (for example `Landing`, `ConfigPanel`, `UserManagement`, `MarkdownContent`) are still uncovered. This is acceptable for the first pass because the highest-risk data flow and interaction logic is now tested.

## Context and Orientation

The frontend app lives in `frontend/`. It uses Vite + React + TypeScript and already had Vitest dependencies configured in `frontend/package.json` and test environment settings in `frontend/vite.config.ts`.

The core logic seams covered by this change are:

- `frontend/src/services/http.ts`: base HTTP wrapper and error formatting.
- `frontend/src/services/sessions.ts`: session list/detail/rename/delete API wrappers and mock-mode branches.
- `frontend/src/services/chat.ts`: chat streaming, SSE frame parsing, error normalization, and mock streaming mode.
- `frontend/src/state/user-store.ts`: Zustand user state and permission-bearing role changes.
- `frontend/src/hooks/usePermission.ts`: permission checks derived from store role.
- `frontend/src/components/ChatView.tsx` and `frontend/src/components/SessionList.tsx`: user input and session interaction behavior.
- `frontend/src/pages/AppHome.tsx`: React Query orchestration of sessions, streaming chat, and local draft handling.

The shared test support added in `frontend/src/test/` centralizes providers, fixtures, and fetch/SSE helpers.

## Plan of Work

The implementation was delivered in three layers. First, the test runtime foundation was hardened (`src/test/setup.ts`) and reusable helpers were added (`src/test/render.tsx`, `src/test/query-client.ts`, `src/test/factories.ts`, `src/test/fetch-mocks.ts`). Second, low-level suites were added for services, state, and hooks. Third, interaction tests were added for `ChatView` and `SessionList`, followed by mocked integration tests for `AppHome`.

The tooling updates were completed last: `frontend/package.json` scripts were extended with `test:run` and `test:coverage`, `frontend/vite.config.ts` received report-only coverage configuration, and `@vitest/coverage-v8` was installed so the coverage command works immediately.

## Concrete Steps

Run these commands from `C:\Users\Feli\Desktop\pichufy\agent\frontend`:

1. Run the test suite once (non-watch mode):

   `npm.cmd run test:run`

   Expected result (current implementation):

   - `8` test files passed
   - `33` tests passed

2. Generate a coverage report (report only):

   `npm.cmd run test:coverage`

   Expected result (current implementation):

   - Tests still pass (`33`/`33`)
   - Coverage text summary is printed
   - HTML report is generated (Vitest default coverage output directory)

## Validation and Acceptance

Acceptance is satisfied when:

1. `npm.cmd run test:run` passes in `frontend/` and exercises the new service/state/component/page suites.
2. `npm.cmd run test:coverage` passes and prints a coverage report using the `v8` provider without failing on thresholds.
3. The `AppHome` tests prove observable orchestration behavior: sessions load, a selected session fetch hydrates history, chat streaming completion appends an assistant message, streaming errors append an assistant error message, and unsaved local drafts can be removed without calling the backend delete service.

Validation performed for this implementation:

- `npm.cmd run test:run` (passed: `8` files, `33` tests)
- `npm.cmd run test:coverage` (passed; coverage report generated)

## Idempotence and Recovery

The tests and coverage commands are safe to run repeatedly. If a test fails due to environment restrictions, rerun outside the sandbox because Vitest/esbuild needs subprocess spawn permissions in this environment. If dependency state drifts, rerun:

`npm.cmd install`

from `frontend/` to restore `node_modules` from `frontend/package-lock.json`.

## Artifacts and Notes

Key implementation artifacts added or updated:

- `frontend/src/test/query-client.ts`
- `frontend/src/test/render.tsx`
- `frontend/src/test/factories.ts`
- `frontend/src/test/fetch-mocks.ts`
- `frontend/src/services/http.test.ts`
- `frontend/src/services/sessions.test.ts`
- `frontend/src/services/chat.test.ts`
- `frontend/src/state/user-store.test.ts`
- `frontend/src/components/ChatView.test.tsx`
- `frontend/src/components/SessionList.test.tsx`
- `frontend/src/pages/AppHome.test.tsx`
- `frontend/src/hooks/usePermission.test.tsx` (expanded)
- `frontend/src/test/setup.ts` (strengthened)
- `frontend/vite.config.ts` (coverage config)
- `frontend/package.json` and `frontend/package-lock.json` (scripts + coverage provider)

Coverage snapshot from the validation run (report-only):

- Total statements: `54.78%`
- Strong coverage in targeted files: `ChatView.tsx`, `SessionList.tsx`, `http.ts`, `sessions.ts`, `chat.ts`, `user-store.ts`, `usePermission.ts`

## Interfaces and Dependencies

Dependencies used by the new suite:

- `vitest` for test runner and mocks
- `@testing-library/react` and `@testing-library/user-event` for component interactions
- `@testing-library/jest-dom` for DOM matchers
- `@tanstack/react-query` test wrapper through a dedicated `QueryClient`
- `@vitest/coverage-v8` for coverage reporting

New internal testing interfaces added:

- `createTestQueryClient()` in `frontend/src/test/query-client.ts`
- `renderWithProviders(...)` and `renderHookWithProviders(...)` in `frontend/src/test/render.tsx`
- `makeSessionSummary(...)`, `makeSessionDetail(...)`, `makeChatMessage(...)` in `frontend/src/test/factories.ts`
- `createJsonResponse(...)`, `createTextResponse(...)`, `createSseResponse(...)` in `frontend/src/test/fetch-mocks.ts`

Revision note (2026-02-25 / Codex): Created this ExecPlan after implementation to document the delivered frontend test-suite work, validation results, and rationale in the format required by `PLANS.md`.
