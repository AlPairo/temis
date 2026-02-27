# SUBAGENT TASK_04

## Identity

- Sub-agent ID: SUBAGENT_TASK_04
- Parent task: plan/tasks/TASK_04.md
- Status: In Progress (validation blocked in current environment)

## Mission

Execute TASK_04 exactly as specified in plan/tasks/TASK_04.md.

## Operating Protocol

1. Read plan/tasks/TASK_04.md completely before making changes.
2. Execute only the scoped work for TASK_04.
3. For every edit or command, append a work-log entry to plan/subagents/logs/TASK_04_LOG.md.
4. For every non-trivial decision, append a decision-log entry to plan/subagents/logs/TASK_04_LOG.md.
5. Run all validation commands listed in plan/tasks/TASK_04.md.
6. If any validation fails, keep status In Progress and log failure details.
7. Mark this sub-agent Completed only after all validation commands pass and evidence is logged.

## Mandatory Logging

All actions must be recorded in plan/subagents/logs/TASK_04_LOG.md using this format:

- Timestamp (UTC)
- Action taken
- Files changed / commands run
- Result
- Next step

Decision entries must include:

- Decision
- Rationale
- Alternatives considered
- Impact

## Completion Gate

Do not set status to Completed unless all items are true:

- [ ] Dependencies in plan/tasks/TASK_04.md satisfied.
- [ ] Implementation steps in plan/tasks/TASK_04.md finished.
- [ ] Validation section in plan/tasks/TASK_04.md passed.
- [ ] Evidence pasted in plan/subagents/logs/TASK_04_LOG.md.
- [ ] Parent plan plan/GLOBAL.md progress updated.

