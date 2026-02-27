# Session Log: RAG Retrieval Returning Empty Results

Date: 2026-02-27
Scope: Investigate why RAG retrieval returned no results and apply a fix.

## User Report
- Symptom: "RAG retrieval is not returning anything."

## Investigation Summary
- Reviewed retriever pipeline in `backend-node/src/modules/rag/retriever.ts`.
- Confirmed retriever normalizes Qdrant payloads and drops points missing required fields (`doc_id` and `text`-equivalent keys).
- Checked runtime configuration and discovered duplicate `QDRANT_URL` entries in `backend-node/.env.local`.
- Reviewed env loading behavior in `backend-node/src/config/env.ts`.

## Root Cause
- The env loader previously used "first value wins" semantics while parsing `.env.local/.env.prod`.
- In `backend-node/.env.local`, `QDRANT_URL` appeared first as empty and later as a real URL.
- Because the first value was kept, runtime effectively saw empty `QDRANT_URL` in local mode, causing fallback to local file vector store.
- Local file vector store had no indexed vectors, so retrieval returned empty.

## Code Changes
1. Updated env file loading behavior:
   - File: `backend-node/src/config/env.ts`
   - Change: Preserve pre-existing process environment variables, but allow later duplicate keys in the same `.env` file to override earlier lines.
   - Effect: `.env` parsing now behaves as expected for duplicate entries.

2. Added regression coverage:
   - File: `backend-node/test/unit/pure-config-auth-chat.test.ts`
   - Change: Extended dotenv loading test to assert:
     - Existing env vars are not overwritten.
     - Duplicate keys in `.env` resolve to the last value.
     - Specific duplicate-key scenario for `QDRANT_URL` is covered.

## Validation
- Command: `npm.cmd run test:unit -- --run test/unit/pure-config-auth-chat.test.ts`
  - Result: Passed (13/13)
- Command: `npm.cmd run test:unit -- --run test/unit/services-data-rag-retriever.test.ts`
  - Result: Passed (12/12)

## Follow-Up
- Restart backend service to load updated env parsing behavior.
- Optional cleanup: remove duplicate keys from `backend-node/.env.local` to avoid future ambiguity.
