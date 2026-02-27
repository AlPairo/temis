# TASK_02 - Scaffold Node Backend Repository

## Objective

Create `backend-node/` with TypeScript, Fastify, linting, and test scaffolding.

## Dependencies

- `TASK_01` completed.

## Files/Directories to Create

- `backend-node/package.json`
- `backend-node/tsconfig.json`
- `backend-node/src/server.ts`
- `backend-node/src/app.ts`
- `backend-node/src/api/routes/health.ts`
- `backend-node/.env.example`

## Atomic Steps

- [ ] Initialize project:
  - `mkdir backend-node`
  - `cd backend-node`
  - `npm init -y`
- [ ] Install runtime deps: `fastify`, `zod`, `pino`, `openai`, `pg`, `ioredis`, `@qdrant/js-client-rest`, `bullmq`.
- [ ] Install dev deps: `typescript`, `tsx`, `eslint`, `@types/node`, test runner of choice (Vitest or Jest).
- [ ] Add scripts:
  - `dev`, `build`, `start`, `lint`, `test`.
- [ ] Add `/health` route returning `{ "status": "ok" }`.
- [ ] Configure CORS for frontend origin (`http://localhost:5173` by default).
- [ ] Commit scaffold as isolated PR.

## Validation

- [ ] `cd backend-node && npm run dev` starts service on configured port.
- [ ] `curl http://localhost:3000/health` returns HTTP 200.
- [ ] `npm run lint` and `npm test` pass.

## Definition of Done

Node service boots reliably with documented scripts and a passing health check.

## Rollback / Recovery

If setup fails, remove `backend-node/` and recreate from this task steps.
