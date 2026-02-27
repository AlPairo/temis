# Node Rollout Runbook (TASK_12)

## Scope

This runbook controls traffic migration from Python (`chat_service.py`) to Node (`backend-node`) with staged rollout, measurable gates, and immediate rollback.

## Owner Roles

- Incident Commander (IC): owns go/no-go and rollback decisions.
- Release Engineer (RE): executes stage-change and rollback commands.
- SRE On-call: monitors errors/latency/stream health and confirms thresholds.
- QA Lead: validates citation quality and user-visible behavior.

## Preconditions

- `TASK_11` artifacts are available in target environment (logs/metrics/tests).
- Python backend is healthy on `http://127.0.0.1:8000`.
- Node backend is healthy on `http://127.0.0.1:3000`.
- Frontend is configured through:
  - `VITE_CHAT_API_BASE_URL`
  - `VITE_USE_NODE_BACKEND`

## Stage Controls

### Traffic Switch Commands

Use PowerShell from repository root:

```powershell
# Stage A/B fallback path (0% Node user traffic, Python primary)
Set-Content -Path frontend/.env.local -Value @"
VITE_USE_NODE_BACKEND=false
VITE_CHAT_API_BASE_URL=http://localhost:8000
"@

# Stage C/D/E Node path (canary percentage is applied by deployment audience targeting)
Set-Content -Path frontend/.env.local -Value @"
VITE_USE_NODE_BACKEND=true
VITE_CHAT_API_BASE_URL=http://localhost:3000
"@

# Rebuild frontend after any change
npm.cmd --prefix frontend run build
```

### One-Click Rollback (Required)

Run this single command to revert all user traffic to Python:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command "Set-Content -Path frontend/.env.local -Value \"VITE_USE_NODE_BACKEND=false`nVITE_CHAT_API_BASE_URL=http://localhost:8000\"; npm.cmd --prefix frontend run build"
```

Owner: Release Engineer.  
Approval: Incident Commander.

## Rollout Stages and Exit Criteria

### Stage A: Internal Testing Only

- Traffic policy: 0% external traffic on Node.
- Checks:
  - `GET /health` and `GET /infra/health` return `200`.
  - 20 internal test chats complete end-to-end.
- Exit criteria:
  - p95 stream completion latency <= 1.30x Python baseline.
  - user-visible errors <= 1%.
  - citation presence >= 95% for prompts expected to use RAG.

### Stage B: Shadow Traffic (Read-Only Compare)

- Traffic policy: user responses still served by Python; mirrored request copy to Node for comparison only.
- Compare dimensions:
  - response latency
  - stream interruption rate
  - citation presence/quality
  - user-visible errors
- Exit criteria:
  - Node p95 latency <= 1.20x Python p95.
  - stream interruption delta <= +0.5 percentage points vs Python.
  - citation presence delta <= -2 percentage points.
  - no Sev-1/Sev-2 incidents for 24 hours.

### Stage C: Canary 10%

- Traffic policy: 10% of users routed to Node, 90% to Python.
- Minimum soak time: 24 hours.
- Exit criteria:
  - Node p95 latency <= Python p95 * 1.15.
  - Node stream interruption rate <= 1.0%.
  - Node user-visible error rate <= 1.0%.
  - citation presence >= 95%.
  - QA manual review of 30 canary conversations: no critical quality regression.

### Stage D: Canary 50%

- Traffic policy: 50% users on Node.
- Minimum soak time: 24 hours.
- Exit criteria:
  - all Stage C criteria still satisfied.
  - no sustained error-budget burn > 2x baseline for 60+ minutes.
  - support tickets about missing citations not above Python baseline.

### Stage E: 100% Node

- Traffic policy: all users routed to Node.
- Minimum soak time before Python deprecation: 7 days.
- Exit criteria:
  - 7 consecutive days within SLO thresholds from Stage D.
  - rollback drill completed successfully at least once during Stage E window.
  - IC + SRE + QA sign-off recorded in cutover checklist.

## Exact Operational Commands

Run backend health checks:

```powershell
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:8000/health
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/health
curl.exe -s -o NUL -w "%{http_code}" http://127.0.0.1:3000/infra/health
```

Run sample stream checks (Python and Node):

```powershell
curl.exe -N -X POST http://127.0.0.1:8000/chat-stream -H "Content-Type: application/json" -d "{\"session_id\":\"rollout-python-check\",\"message\":\"Prueba de estabilidad de stream.\"}"
curl.exe -N -X POST http://127.0.0.1:3000/chat/stream -H "Content-Type: application/json" -d "{\"session_id\":\"rollout-node-check\",\"message\":\"Prueba de estabilidad de stream.\"}"
```

Run lightweight concurrent smoke test for Node infrastructure:

```powershell
npm.cmd --prefix backend-node run build
node --experimental-strip-types backend-node/src/scripts/simulate-multi-requests.ts
```

## Canary Comparison Procedure

- SRE exports Python/Node metrics for the same 60-minute window.
- RE computes deltas for latency, interruption, and error rate.
- QA scores citation presence/quality on a fixed prompt set.
- IC decides go/no-go using stage exit criteria.

## Rollback Drill (Must Run At Least Once)

1. While in Stage C/D/E, execute one-click rollback command.
2. Confirm new chats route to Python (`/chat-stream` on `:8000`).
3. Observe 15 minutes of stable metrics and no increase in user-visible errors.
4. Restore previous stage command and continue rollout.
5. Log drill evidence in incident/release notes.

## Freeze and Deprecation

After Stage E stability:

- Freeze Python write path on **March 31, 2026** (read-only allowed for audit export).
- Announce Python backend retirement for **April 15, 2026**.
- Remove Python traffic route only after backup/export verification is complete.

## Incident Rule

If any stage breaches thresholds, immediately revert to prior stage and open an incident with logs/metrics snapshots attached.
