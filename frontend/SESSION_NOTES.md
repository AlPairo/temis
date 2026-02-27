# Session Notes (2026-02-25)

## Product / UX decisions

- App name: `Temis`.
- Visual direction: professional law-firm style, mainly white/gray shades with a restrained dark accent.
- Typography choice for now: `Cormorant Garamond` (headings) + `Inter` (UI/body), instead of Times New Roman for better screen readability.
- Landing page requirements:
  - clean/professional presentation
  - `Sign up` and `Login` buttons
  - `Login` should navigate to the main app page
  - `Sign up` does nothing for now (placeholder)
- Main app page requirements:
  - top greeting: `Bienvenido, {username}`
  - left panel: previous chat sessions
  - center: chat view with large chat box
  - config / admin capabilities by role

## Role model agreed/implemented

- `basic`:
  - access chat
  - view previous sessions
  - config panel (read-only) for materias, date access, remaining quota
- `supervisor`:
  - everything in `basic`
  - edit materias for basic users
  - filter available dates
  - assign/remove/edit quotas
  - add/edit/delete users
  - granular permissions (`read` / `edit`)
- `admin`:
  - everything in `supervisor`
  - change user levels (roles)
  - assign/delete permissions

## Frontend implementation delivered

- Created new frontend project in `frontend/` (Vite + React + TypeScript + Tailwind v4).
- Added reusable UI components and layout pieces.
- Implemented landing page and `/app` workspace.
- Implemented mockable role/permission system with `basic | supervisor | admin`.
- Added chat/session API integration stubs and SSE stream handler for `/chat/stream`.
- Added documentation files:
  - `frontend/README.md`
  - `frontend/DECISIONS.md`

## Important debugging / environment findings

- Vite startup initially failed in sandbox with `spawn EPERM` (esbuild child process blocked). Running dev server outside sandbox resolved startup.
- `@vitejs/plugin-react-swc@^4.3.1` did not exist in registry for this environment; changed to `^4.2.0`.
- Tailwind v4 PostCSS config issue:
  - using `tailwindcss` directly as a PostCSS plugin caused runtime overlay error
  - fixed by installing `@tailwindcss/postcss` and updating `frontend/postcss.config.cjs`
- CSS ordering issue:
  - `@import` must appear before `@source`
  - fixed in `frontend/src/index.css`

## Runtime verification (Playwright MCP)

- Verified landing page loads at `http://localhost:5173`.
- Verified login button navigates to `/app`.
- Verified main workspace renders greeting, session list, chat area, and config panel.
- Verified backend sessions load when using `http://localhost:5173` origin.

## CORS note (important)

- Opening frontend via `http://127.0.0.1:5173` caused CORS failures against backend.
- Backend default CORS origin is `http://localhost:5173`, so use `localhost` (not `127.0.0.1`) unless backend `FRONTEND_ORIGIN` is updated.

## Build status

- `npm run build` completed successfully after the fixes.
