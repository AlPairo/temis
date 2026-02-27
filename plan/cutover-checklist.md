# Node Cutover Checklist (TASK_12)

Use this checklist during and after Stage E rollout.

## 1) Pre-Cutover (Before 100%)

- [ ] Dependency check: `TASK_11` observability and tests are available.
- [ ] Incident Commander (IC), Release Engineer (RE), SRE On-call, and QA Lead are assigned and present.
- [ ] Python and Node health checks are green:
  - [ ] `http://127.0.0.1:8000/health` => `200`
  - [ ] `http://127.0.0.1:3000/health` => `200`
  - [ ] `http://127.0.0.1:3000/infra/health` => `200`
- [ ] Stage C (10%) and Stage D (50%) both completed with metrics inside thresholds from `plan/rollout-runbook.md`.
- [ ] Rollback command tested once successfully in a drill.

## 2) Cutover (Stage E to 100%)

- [ ] RE applies Node traffic command:
  - `VITE_USE_NODE_BACKEND=true`
  - `VITE_CHAT_API_BASE_URL=http://localhost:3000`
- [ ] RE rebuilds/redeploys frontend artifact.
- [ ] SRE verifies first 50 production requests:
  - [ ] no spike in `5xx`
  - [ ] stream interruptions remain within threshold
  - [ ] p95 latency within threshold
- [ ] QA verifies citation presence/quality on agreed prompt suite.
- [ ] IC records formal go-live timestamp.

## 3) Post-Cutover Stabilization (7 Days)

- [ ] Daily error budget review confirms thresholds are met.
- [ ] Daily user-visible error review confirms no sustained regression.
- [ ] Daily citation quality sampling completed and signed by QA.
- [ ] Any rollback trigger immediately executes one-click rollback and incident workflow.

## 4) Python Write Freeze and Retirement

- [ ] Freeze Python write path on **March 31, 2026**.
- [ ] Keep Python read-only access for audits/exports until retirement date.
- [ ] Archive Python logs and session data snapshot before shutdown.
- [ ] Announce retirement date **April 15, 2026** to stakeholders.
- [ ] Remove Python traffic route after final sign-off.

## 5) Final Completion Criteria

- [ ] Node backend is primary chat path for all users.
- [ ] Canary and full rollout metrics stayed inside thresholds.
- [ ] Rollback drill evidence is attached to release notes.
- [ ] Python backend deprecation date is documented and communicated.
