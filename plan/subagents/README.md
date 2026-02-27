# Sub-Agent Execution Framework

This folder contains one sub-agent specification per migration task (`TASK_01` to `TASK_12`).

## Mandatory Rules

- A task can be marked complete only when all validation/test commands in its task file pass.
- Every sub-agent must append all implementation actions to its log file.
- Every design or implementation choice must be recorded in the log `Decision Log` section.
- If tests fail, task status remains `In Progress` and the failure evidence must be logged.
- No silent changes: each code edit must have a corresponding log entry.

## File Layout

- `plan/subagents/TASK_XX_SUBAGENT.md`: execution instructions and completion gate.
- `plan/subagents/logs/TASK_XX_LOG.md`: chronological work log + decision log + validation evidence.

## Completion Gate (Global)

A task reaches `Completed` state only if:

1. Dependencies are completed.
2. Implementation steps in `plan/tasks/TASK_XX.md` are done.
3. Validation commands in `plan/tasks/TASK_XX.md` passed.
4. Evidence is pasted in `plan/subagents/logs/TASK_XX_LOG.md`.
5. The sub-agent status line is changed from `In Progress` to `Completed`.
