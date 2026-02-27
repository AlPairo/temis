# TASK_12 - Shadow Traffic, Canary Rollout, and Cutover

## Objective

Move traffic safely from Python backend to Node backend with rollback controls.

## Dependencies

- `TASK_11` completed.

## Files to Create

- `plan/rollout-runbook.md`
- `plan/cutover-checklist.md`

## Atomic Steps

- [ ] Define rollout stages:
  - Stage A: internal testing only
  - Stage B: shadow traffic (read-only compare)
  - Stage C: 10% canary users
  - Stage D: 50%
  - Stage E: 100%
- [ ] Define exit criteria for each stage (latency, error budget, quality checks).
- [ ] Implement one-click rollback method (feature flag and/or routing switch).
- [ ] During canary, compare:
  - response latency
  - stream interruption rate
  - citation presence/quality
  - user-visible errors
- [ ] After stable 100%, freeze old Python write path and schedule deprecation.

## Validation

- [ ] Rollout runbook has exact commands and owner roles.
- [ ] Canary completes with metrics inside acceptable thresholds.
- [ ] Rollback drill executed successfully at least once.

## Definition of Done

Node backend is primary chat path, Python path is deprecated with documented retirement date.

## Rollback / Recovery

If thresholds are breached at any stage, revert to previous stage immediately and open incident issue with captured logs/metrics.
