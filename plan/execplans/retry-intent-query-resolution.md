# Resolve Retry Commands to Prior Query Intent

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document follows `PLANS.md` from the repository root.

## Purpose / Big Picture

When a user writes a short retry command such as `vuelve a intentar`, the backend currently sends that literal command to retrieval. That behavior lowers retrieval quality because the command text is not the legal question. After this change, the system resolves an effective retrieval query from conversation context, so retries reuse the latest useful user query and optional extra guidance in the retry message.

## Progress

- [x] (2026-02-27 00:00Z) Added deterministic retry-intent resolver module in backend chat domain.
- [x] (2026-02-27 00:00Z) Integrated effective-query resolution into chat orchestration before retrieval.
- [x] (2026-02-27 00:00Z) Wired effective query into retrieval call, retrieval-event persistence, and analysis prompt input.
- [x] (2026-02-27 00:00Z) Added resolver unit tests and expanded orchestrator tests for retry behavior and suffix merging.
- [x] (2026-02-27 00:00Z) Ran targeted backend tests; all retry-intent and orchestrator scenarios passed (13/13).

## Surprises & Discoveries

- Observation: The orchestrator previously expected `getConversationMessages` only for prompt construction in analysis mode.
  Evidence: Existing tests asserted no history reads in docs-only/error paths; integration of retry-resolution adds one pre-retrieval history read.

## Decision Log

- Decision: Implement retry resolution with deterministic heuristics instead of an LLM classifier.
  Rationale: Zero extra model cost and predictable behavior for explicit commands.
  Date/Author: 2026-02-27 / Codex

- Decision: Preserve raw user message in stored chat history while using resolved effective query only for retrieval and prompt intent.
  Rationale: Maintains faithful transcript while improving search intent quality.
  Date/Author: 2026-02-27 / Codex

## Outcomes & Retrospective

The backend now resolves retry commands (`vuelve a intentar`, `de nuevo`, `retry`, etc.) against prior user context before retrieval runs. This prevents command-like messages from being embedded as standalone legal queries and keeps existing API contracts intact. Targeted backend validation passed for resolver and orchestrator behavior.

## Context and Orientation

The retrieval query is assembled inside `backend-node/src/modules/chat/chat-orchestrator.ts`. That same orchestrator persists retrieval events through `appendRetrievalEvent` and builds analysis prompts through `buildPrompt`. Because this is where all retrieval-bound text converges, this is the correct insertion point for retry-intent resolution.

The new resolver module is `backend-node/src/modules/chat/retry-intent.ts`. It receives current user text plus prior messages and returns `effectiveQuery` with metadata describing whether retry-intent was detected and how the query was resolved.

## Plan of Work

Introduce a pure helper module for retry-intent parsing and base-query selection. The resolver detects retry-style leading commands, extracts optional suffix instructions, finds the latest useful prior user message, and returns an effective query. Integrate this into `ChatOrchestrator.streamReply` so retrieval, retrieval event persistence, and analysis prompt input all use the effective query while raw user text remains the stored user message.

## Concrete Steps

From repository root:

1. Add resolver module:
   - File: `backend-node/src/modules/chat/retry-intent.ts`
   - Implement `resolveEffectiveQuery` with retry detection, suffix normalization, base-query lookup, and fallback behavior.
2. Update orchestrator:
   - File: `backend-node/src/modules/chat/chat-orchestrator.ts`
   - Resolve effective query before appending retrieval event and before retrieval call.
   - Use effective query in `retrieve({ query })`, `appendRetrievalEvent({ query })`, and `buildPrompt({ userText })`.
3. Add and update tests:
   - New file: `backend-node/test/unit/services-data-chat-retry-intent.test.ts`
   - Update file: `backend-node/test/unit/services-data-chat-orchestrator.test.ts`

## Validation and Acceptance

Run targeted tests from `backend-node`:

    npm.cmd run test:unit -- test/unit/services-data-chat-retry-intent.test.ts test/unit/services-data-chat-orchestrator.test.ts

Acceptance:

- Retry command without suffix reuses latest useful prior user query.
- Retry command with suffix merges prior query plus new guidance.
- No-prior-query retry falls back to raw message.
- Orchestrator persists retrieval event query as effective query.

## Idempotence and Recovery

All code changes are additive and safe to re-run in repeated test cycles. If a test fails, update code and rerun the same command. No migrations or destructive operations are involved.

## Artifacts and Notes

Expected post-change behavior example:

    Prior user: "Necesito ayuda con despidos indebidos"
    Next user: "vuelve a intentar"
    Retrieval query used: "Necesito ayuda con despidos indebidos"

Validation transcript summary:

    Command (cwd: backend-node):
      npm.cmd run test:unit -- test/unit/services-data-chat-retry-intent.test.ts test/unit/services-data-chat-orchestrator.test.ts
    Result:
      2 files passed
      13 tests passed
      0 failed

## Interfaces and Dependencies

New backend interface shape in `retry-intent.ts`:

    export interface RetryIntentResolution {
      effectiveQuery: string;
      isRetryIntent: boolean;
      resolution: "raw_user_message" | "previous_user_message" | "fallback_raw";
      suffixApplied: boolean;
    }

No HTTP route or frontend contract changes are required.

Revision Note (2026-02-27): Updated after running targeted backend tests to record validation evidence and completion status.
