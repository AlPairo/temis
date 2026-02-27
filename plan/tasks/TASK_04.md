# TASK_04 - Postgres Schema for Conversations and Audit Trail

## Objective

Implement durable, append-only storage for conversations, messages, retrieval events, and audits.

## Dependencies

- `TASK_03` completed.

## Files to Create

- `backend-node/migrations/0001_initial.sql`
- `backend-node/src/modules/audit/audit-repository.ts`
- `backend-node/src/modules/chat/chat-repository.ts`

## Atomic Steps

- [ ] Create tables:
  - `conversations`
  - `messages`
  - `retrieval_events`
  - `audit_events`
- [ ] Use immutable pattern: no update/delete endpoints for message/audit rows.
- [ ] Add indexes:
  - by `conversation_id`
  - by `created_at`
  - by `user_id` if auth exists
- [ ] Add migration runner command and startup check.
- [ ] Implement repository functions with parameterized SQL only.

## Validation

- [ ] `npm run migrate` creates tables in empty DB.
- [ ] Insert/read path works for one synthetic conversation.
- [ ] Direct updates to immutable rows are blocked by code path (and optionally DB permissions/trigger).

## Definition of Done

Chat and audit persistence is reliable and queryable by conversation ID.

## Rollback / Recovery

If migration fails in non-prod, drop created tables and rerun.
In shared environments, add a new corrective migration instead of editing old migration.
