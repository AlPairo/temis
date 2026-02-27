# RAG LLM Reranker and Prompt Centralization

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

This document must be maintained in accordance with `PLANS.md` at the repository root.

## Purpose / Big Picture

After this change, chat answers are grounded in a better-ranked set of legal chunks because retrieval will use a two-stage pipeline: vector retrieval for 20 candidates followed by an OpenAI LLM reranker that selects the best 5 chunks for the final prompt context. This improves relevance without changing the chat API. At the same time, all backend LLM prompt templates will live in one folder so prompt maintenance becomes straightforward.

## Progress

- [x] (2026-02-26 00:00Z) Confirmed current RAG flow (`retriever.ts` -> `prompt-builder.ts` -> OpenAI streaming) and identified insertion point for reranking.
- [x] (2026-02-26 00:00Z) Locked product decisions with user: OpenAI LLM reranker, `20 -> 5`, rerank failure falls back to vector top-N, centralize LLM prompts only.
- [ ] Implement backend prompt centralization under `backend-node/src/prompts/`.
- [ ] Implement OpenAI LLM reranker module and wire retriever pipeline to `20 -> final topK`.
- [ ] Add/adjust tests for rerank success/fallback and prompt centralization.
- [ ] Run backend validation (`test:unit`, `build`, `test:typecheck`) and record outcomes.

## Surprises & Discoveries

- Observation: The chat route already accepts fields like `hybrid`, `alpha`, `beta`, and `embedding_model`, but only `top_k` and `chat_model` are currently wired to orchestration.
  Evidence: `backend-node/src/api/routes/chat.ts` request schema and `orchestrator.streamReply(...)` call arguments.

## Decision Log

- Decision: Keep reranking inside `modules/rag` rather than adding orchestration-level logic.
  Rationale: The chat orchestrator should continue treating retrieval as a single dependency returning final chunks/citations for prompt assembly.
  Date/Author: 2026-02-26 / Codex.
- Decision: Centralize LLM prompts as TypeScript modules in `backend-node/src/prompts/` instead of loading external text files.
  Rationale: This keeps bundling/runtime simple while still providing a single folder with easy access to prompts.
  Date/Author: 2026-02-26 / Codex.

## Outcomes & Retrospective

Implementation in progress. Final outcomes and validation results will be recorded after code and tests are complete.

## Context and Orientation

The backend chat flow lives in `backend-node/src/modules/chat/chat-orchestrator.ts`. It persists the user message, calls `retrieve(...)` from `backend-node/src/modules/rag/retriever.ts`, stores the retrieval event, builds prompt messages via `backend-node/src/modules/chat/prompt-builder.ts`, and streams the final answer from OpenAI.

Today, `retriever.ts` performs single-stage vector retrieval: it creates a query embedding with OpenAI embeddings, queries Qdrant (or the local file vector store fallback), normalizes payloads into chunks, builds citations, and returns them in vector-score order. `prompt-builder.ts` then injects those chunks and citations into a system retrieval block that becomes part of the final system prompt context.

This plan adds a new `modules/rag/reranker.ts` stage that uses an OpenAI LLM to reorder/select candidates after vector retrieval and before prompt construction. It also moves LLM prompt text into `backend-node/src/prompts/`.

## Plan of Work

First, create the `backend-node/src/prompts/` folder and move the current chat system guardrails and retrieval-context block rendering into prompt modules. Update `modules/chat/prompt-builder.ts` so it assembles messages exactly as before but imports prompt text/template helpers from the new folder.

Next, create `backend-node/src/modules/rag/reranker.ts` and `backend-node/src/prompts/rag/reranker.ts`. The reranker module will call the OpenAI SDK singleton (`clients/openai.ts`) using a non-stream chat completion with JSON-object output. It will send the user query and up to 20 candidate chunks, validate the returned JSON (`selected_ids`) with Zod, and map IDs back to chunks. It will deduplicate IDs and fill any missing selections from original vector order.

Then, patch `modules/rag/retriever.ts` so the vector query requests `candidateTopK = max(20, finalTopK)`, normalizes candidates, runs reranking (for 2+ chunks), falls back to vector order on reranker failures, and builds citations from the final selected chunks only. Preserve current blank-query behavior and existing metadata normalization. Add rerank-specific observability logs.

Finally, update tests in `backend-node/test/unit/` for the new retrieval semantics, rerank fallback behavior, and the prompt centralization refactor. Run backend validation commands and record results here.

## Concrete Steps

From repository root `C:\Users\Feli\Desktop\pichufy\agent`:

1. Edit backend files for prompt centralization and reranker pipeline:
   - `backend-node/src/prompts/**`
   - `backend-node/src/modules/chat/prompt-builder.ts`
   - `backend-node/src/modules/rag/reranker.ts`
   - `backend-node/src/modules/rag/retriever.ts`
   - `backend-node/src/config/env.ts`
   - `backend-node/src/clients/openai.ts`
2. Update unit tests:
   - `backend-node/test/unit/services-data-rag-retriever.test.ts`
   - `backend-node/test/unit/pure-config-auth-chat.test.ts` (only if prompt wording/exports affect assertions)
   - `backend-node/test/unit/observability-clients-migrations-clients.test.ts` (if mock client shape assumptions require updates)
3. Run validation commands from `backend-node/`:
   - `npm.cmd run test:unit`
   - `npm.cmd run build`
   - `npm.cmd run test:typecheck`

## Validation and Acceptance

Acceptance is met when:

- `retrieve(...)` queries vector storage with 20 candidates by default and returns a final reranked top-5.
- If reranking fails, the system still returns vector-ranked results and does not break chat.
- `prompt-builder.ts` uses prompt helpers from `backend-node/src/prompts/` and still injects retrieval chunks/citations into the final system prompt context.
- Backend unit tests pass, including new rerank behavior coverage.
- Backend TypeScript build/typecheck pass.

## Idempotence and Recovery

These changes are additive and safe to reapply. If reranking introduces regressions, disable the rerank call path inside `retriever.ts` while leaving prompt centralization in place. If prompt centralization causes import issues, restore direct strings in `prompt-builder.ts` temporarily and keep the new prompt modules for gradual migration.

## Artifacts and Notes

Expected validation commands (to be run and recorded after implementation):

    cd backend-node
    npm.cmd run test:unit
    npm.cmd run build
    npm.cmd run test:typecheck

## Interfaces and Dependencies

The chat route API remains unchanged. `backend-node/src/modules/rag/retriever.ts` continues returning `RetrievalResult`, but its internal behavior changes to perform two-stage ranking before building citations. The new reranker module depends on the existing OpenAI singleton from `backend-node/src/clients/openai.ts` and uses the installed `openai` SDK with JSON-object chat completions. Prompt text is centralized under `backend-node/src/prompts/` and imported by both `modules/chat/prompt-builder.ts` and `modules/rag/reranker.ts`.

Revision Note (2026-02-26): Created for implementation of OpenAI LLM reranking (`20 -> 5`) with fallback to vector ranking and backend LLM prompt centralization under a single folder.
