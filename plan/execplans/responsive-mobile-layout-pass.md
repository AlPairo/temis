# Responsive and Mobile-Friendly Frontend Layout Pass

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, the web UI is usable on phones and small tablets. The main app (`/app`) should no longer stack sessions and chat into an overly tall page; instead, mobile users can switch between chat, sessions, and config panels. The landing page and top bar should also avoid overflow and cramped controls on narrow screens. The result will be verified with Playwright MCP using mobile and desktop viewports.

## Progress

- [x] (2026-02-25 03:05Z) Reviewed frontend layout components (`AppHome`, `Topbar`, `SessionList`, `ChatView`, `Landing`) and confirmed mobile stacking issues.
- [x] (2026-02-25 03:28Z) Implemented mobile panel navigation and layout adjustments in `/app` (mobile tabs for `Sesiones`, `Chat`, `Config`; desktop 3-column layout preserved).
- [x] (2026-02-25 03:34Z) Tightened responsive typography/spacing and overflow behavior in `Topbar`, `Landing`, `SessionList`, and `ChatView`.
- [x] (2026-02-25 03:54Z) Validated responsive behavior with Playwright MCP on mobile and desktop viewports against local dev frontend (`http://127.0.0.1:5173`).
- [x] (2026-02-25 03:58Z) Recorded outcomes and validation evidence.

## Surprises & Discoveries

- Observation: `AppHome` currently uses a single-column grid on mobile, which renders `SessionList` above `ChatView`; this makes the chat panel hard to reach and not app-like on phones.
  Evidence: `frontend/src/pages/AppHome.tsx` uses `grid-cols-1` below `md`.
- Observation: Frontend dev app was reachable at `127.0.0.1:5173`, but browser requests to backend `localhost:3000` failed due CORS during Playwright tests.
  Evidence: Playwright console messages on `/app` showed CORS errors for `/sessions` and `/chat/stream`.

## Decision Log

- Decision: Use a mobile tab/segmented navigation in `AppHome` instead of a drawer.
  Rationale: Lower implementation risk, no overlay state complexity, and easy to validate with keyboard/touch interactions.
  Date/Author: 2026-02-25 / Codex.

## Outcomes & Retrospective

Implemented a mobile-first panel switcher for `/app` so phones no longer get a long stacked sessions+chat page. Desktop layout remains a 3-column grid. Supporting responsive fixes reduced overflow risks in the header, landing page, and chat/session panels.

Playwright MCP validation covered:

- Mobile viewport (`390x844`): `/` and `/app` render without horizontal overflow; mobile tabs switch between `Sesiones`, `Chat`, and `Config`.
- Mobile chat interaction: textarea input + `Enter` send flow still works; API failure path shows localized fallback error message (observed because backend requests were blocked by CORS in browser).
- Desktop viewport (`1366x900`): `/app` preserves multi-panel layout and shows no horizontal overflow.

Residual issue outside this UI task:

- Local dev CORS configuration is rejecting requests from `http://127.0.0.1:5173` to `http://localhost:3000`, which affects real session/chat API calls during browser tests. The frontend fallback messaging now handles this gracefully, but backend CORS config should allow the frontend origin (or frontend should use `localhost` consistently).

## Context and Orientation

The React frontend lives in `frontend/src`. The app shell route `/app` is rendered by `frontend/src/pages/AppHome.tsx`. `SessionList`, `ChatView`, and `ConfigPanel` are separate components already used in desktop layout. `Topbar` is the header for the app shell. The landing route `/` is `frontend/src/pages/Landing.tsx`.

The frontend supports mock mode using `VITE_USE_MOCK=true`, which lets us test responsive behavior without a running backend.

## Plan of Work

Refactor `AppHome` into a mobile-first layout with a small segmented control that switches among chat, sessions, and config on narrow screens, while preserving the existing desktop three-column layout from `md` upward. Then adjust panel wrappers and overflow behavior so each panel is scrollable without awkward borders on mobile.

After that, reduce overflow risk in `Topbar` and tune `Landing` spacing/typography/button wrapping for narrow viewports. Finally, run the frontend in mock mode and validate interactions and layout with Playwright MCP on mobile and desktop viewports.

## Concrete Steps

From repository root:

    1. Edit `frontend/src/pages/AppHome.tsx` for mobile panel state + responsive wrappers.
    2. Edit `frontend/src/components/SessionList.tsx`, `frontend/src/components/ChatView.tsx`, and `frontend/src/components/layout/Topbar.tsx` for responsive sizing/spacing.
    3. Edit `frontend/src/pages/Landing.tsx` for mobile typography and header/button layout.
    4. Start frontend in mock mode and test with Playwright MCP.

## Validation and Acceptance

Acceptance is met when:

- On a mobile viewport (for example 390x844), `/app` shows a clear mobile navigation to switch between chat, sessions, and config without stacked clutter.
- The chat input and message area remain usable on mobile without horizontal overflow.
- The landing page hero/header/buttons fit mobile widths cleanly.
- Desktop layout remains usable and visually consistent.
- Playwright MCP checks are performed and recorded for at least one mobile and one desktop viewport.

## Idempotence and Recovery

These are UI-only layout changes and are safe to repeat. If the mobile panel navigation causes regressions, revert only the `AppHome` mobile branch and keep the smaller responsive spacing fixes in `Topbar` and `Landing`.

## Artifacts and Notes

Validation will use `VITE_USE_MOCK=true` when starting the frontend so chat and sessions render without backend dependencies.

## Interfaces and Dependencies

No API contracts change. `frontend/src/pages/AppHome.tsx` will add local UI state for mobile panel selection only. Existing component props for `SessionList`, `ChatView`, and `ConfigPanel` should remain compatible unless a minimal optional `className` is introduced for layout control.

Revision Note (2026-02-25): Created to execute user-requested responsive/mobile adaptation and Playwright MCP validation.
