# Centralize Backend Prompts and Frontend UI Text

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document is maintained in accordance with `PLANS.md`.

## Purpose / Big Picture

After this change, backend LLM prompt strings live in one backend source file and frontend user-facing copy lives in one frontend source file. This reduces drift (duplicate strings, mismatched wording) and makes future copy/prompt edits a single-file task.

## Progress

- [x] (2026-02-26 00:00Z) Scoped current backend prompt files and frontend UI components containing hardcoded copy.
- [x] (2026-02-26 00:00Z) Identified additional backend prompt in `backend-node/src/modules/chat/session-title-generator.ts`.
- [x] (2026-02-26 00:00Z) Created single backend prompt source in `backend-node/src/prompts/index.ts`, moved session title prompt there, and removed split prompt leaf files.
- [x] (2026-02-26 00:00Z) Created `frontend/src/text.ts` and migrated user-facing frontend copy (pages/components/services/mocks/defaults) to it.
- [x] (2026-02-26 00:00Z) Validated backend (`test:unit`, `build`) and frontend (`test:run`, `build`) successfully.

## Surprises & Discoveries

- Observation: The repo instruction references `.agent/PLANS.md`, but this workspace only has `PLANS.md`.
  Evidence: `Get-Content .agent\\PLANS.md` failed with path not found; `PLANS.md` exists at repo root.

- Observation: Local `vitest`/`vite` invocations may fail in sandbox with `spawn EPERM` because esbuild tries to spawn a child process.
  Evidence: Backend and frontend validation both required an elevated rerun after an initial sandbox `Error: spawn EPERM`.

## Decision Log

- Decision: Treat "frontend text" as user-facing copy (labels, messages, placeholder text, prompts) rather than every string literal (paths, routes, classes, API fields).
  Rationale: Full literal extraction would include non-copy strings and produce low-value churn; user intent is copy centralization.
  Date/Author: 2026-02-26 / Codex

- Decision: Keep `backend-node/src/prompts/index.ts` as the single backend prompt source file.
  Rationale: Existing modules already import from `../../prompts/index.js`; this minimizes import churn.
  Date/Author: 2026-02-26 / Codex

## Outcomes & Retrospective

Completed the requested centralization in the intended sense: backend LLM prompts now live in a single source file (`backend-node/src/prompts/index.ts`), and frontend user-facing copy now lives in a single source file (`frontend/src/text.ts`). Validation passed for both subprojects, indicating the refactor preserved behavior. Non-copy string literals (routes, API field names, CSS classes, type identifiers) intentionally remain in place.

## Context and Orientation

Backend prompt code is currently split across `backend-node/src/prompts/chat/system-guardrails.ts`, `backend-node/src/prompts/chat/retrieval-context.ts`, and `backend-node/src/prompts/rag/reranker.ts`, while `backend-node/src/modules/chat/session-title-generator.ts` contains a separate inline system prompt. Frontend UI copy is partially centralized in `frontend/src/pages/appHomeText.ts`, but `Landing`, `SessionList`, `ChatView`, `ConfigPanel`, `Topbar`, `UserManagement`, and `frontend/src/services/chat.ts` still define user-facing text inline.

## Plan of Work

Move all backend prompt constants/builders into `backend-node/src/prompts/index.ts`, including the session-title system prompt, then update imports to read from that file. Remove now-unused prompt subfiles so the backend prompt source is physically centralized.

Create one frontend copy module (single file) that includes all user-facing text used by pages/components/services. Replace inline literals in the identified files with references to the centralized object while preserving behavior and tests.

## Concrete Steps

From repo root:

  1. Edit `backend-node/src/prompts/index.ts` to contain all prompt constants/builders/types.
  2. Update backend imports (notably `backend-node/src/modules/chat/session-title-generator.ts`).
  3. Delete unused backend prompt leaf files.
  4. Create `frontend/src/text.ts` (or equivalent single file) and move user-facing copy there.
  5. Update frontend components/pages/services to import the centralized text object.
  6. Run targeted tests/typecheck for changed projects.

## Validation and Acceptance

Acceptance is met when:

1. Backend prompt strings used for chat guardrails, retrieval-context formatting, reranker prompts, and session-title generation are defined in one source file.
2. Frontend user-facing copy used by the app pages/components/services is defined in one source file.
3. Targeted tests or typechecks for changed files pass (or failures are documented with cause).

## Idempotence and Recovery

This refactor is additive/referential until prompt leaf-file deletion. If a patch introduces import errors, restore by re-pointing imports to the previous files and re-running validation. No database or irreversible runtime state changes are involved.

## Artifacts and Notes

Validation summary:

  - Backend: `npm.cmd run test:unit` PASS, `npm.cmd run build` PASS
  - Frontend: `npm.cmd run test:run` PASS (37 tests), `npm.cmd run build` PASS

## Interfaces and Dependencies

Backend exported prompt interfaces must continue to expose:

  - `CHAT_SYSTEM_GUARDRAILS`
  - `buildChatRetrievalContextBlock(retrieval)`
  - `RAG_RERANKER_SYSTEM_PROMPT`
  - `buildRagRerankerUserPrompt(input)`
  - `RerankerPromptCandidate`
  - `SESSION_TITLE_SYSTEM_PROMPT` (new export for session-title generator)

Frontend centralized copy module should export a stable object consumed by components/pages/services, with nested sections per feature to avoid string scattering.

Revision note (2026-02-26): Completed implementation and validation; updated progress, discoveries, and outcomes to reflect the final state.
