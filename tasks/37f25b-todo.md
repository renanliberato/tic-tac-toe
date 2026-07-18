# Make the development flow task-scoped, durable, and observable

## Goal

Replace `./dev-flow`'s direct agent-output forwarding with a task-scoped orchestration experience that:

1. gives every prompt-driven run a collision-checked random six-lowercase-hex task ID;
2. persists the refined specification as `tasks/<hash>-todo.md` and commits it before implementation;
3. captures every `mswea` invocation's complete combined stdout/stderr in durable, committed task session transcripts;
4. renames the todo file to `tasks/<hash>-done.md` in the implementation commit and retains it permanently; and
5. renders concise progress rather than child output, exposing completed, active, upcoming, skipped, and loop-substate orchestration work.

The flow must remain a POSIX shell-based, dependency-free toolchain and continue to use the single `DEV_FLOW_MODEL` resolution/propagation contract.

## Current repository context

- `dev-flow` currently resolves and exports `DEV_FLOW_MODEL`, runs `git-sync`, creates and enters a linked worktree, invokes `git-save`, optionally calls `./refine --auto --print-task-path` only behind `--refine-auto`, commits the task itself, then runs an implementer, `git-commit`, `ensure-tests`, `code-review`, and `git-worktree-merge`.
- A plain `./dev-flow PROMPT` currently calls the implementer directly; no-argument mode launches an unprompted implementer.
- `refine` currently allocates a collision-checked `uuid.uuid4().hex[:6]` task filename below `tasks/`, runs one fresh `mswea` interview agent per round, and only creates its task file on confirmed completion. Its protocol already requires the exact explicit final-confirmation question and does not permit `REFINE_FINISHED` before a confirmed final answer.
- `git-sync` may run an agent to resolve a rebase conflict before a worktree exists. `git-worktree-merge` may run one after normal worktree processing to resolve a merge conflict.
- The existing agent roles are: refine interview agent; sync conflict resolver; implementer; `git-commit` committer; `ensure-tests` coverage assessor and test fixer; `code-review` reviewer and review fixer; merge conflict resolver. Review and test/fix paths can repeat.
- `git-commit` relies on the checkpoint made by `git-save` and delegates the actual commit to an agent. `code-review` uses a reviewer/fixer loop and invokes `git-save`, `git-commit`, and `ensure-tests` for accepted fixes.
- Existing tests include `tests/refine.test.js`, `tests/dev-flow-model.test.js`, and helper/worktree tests. Extend/add focused automated coverage for the new behavior without relying on a real `mswea` service.

## Scope and behavior

### 1. Invocation interface and task identity

- Every prompt-based `./dev-flow PROMPT` invocation must mandatorily refine first. Remove the behavioral distinction that previously made refinement conditional.
- Keep `./dev-flow --refine-auto PROMPT` as a silent compatibility alias with exactly the same behavior as `./dev-flow PROMPT`; do not emit a deprecation warning.
- A no-argument `./dev-flow` invocation must fail with a clear usage message requiring a prompt. Do not retain an unattended, unprompted implementation mode.
- Allocate the task/run ID at the start of a dev-flow run, before synchronization, using the existing collision-checked random six-hex convention. A repeat of the same prompt receives a new ID; do not introduce deterministic content hashing.
- Add `./dev-flow --task PATH` as the explicit handoff for a standalone pre-refined task. It must skip refinement and use the existing task ID. Before implementation, accept only a path that resolves to the canonical repository-local `tasks/<six-lowercase-hex>-todo.md`, is tracked and unchanged from current `HEAD` after synchronization, and reject missing, malformed, outside-repository, uncommitted/modified, or `-done.md` inputs.
- A prompt-based run and `--task` are distinct modes; reject ambiguous/invalid argument combinations with clear usage diagnostics.

### 2. Refined todo lifecycle

- At refinement start, create `tasks/<hash>-todo.md` containing the rough prompt and a conspicuous incomplete-refinement marker. This gives failed/cancelled refinement a truthful, task-scoped record.
- Once the refiner receives the required explicit final confirmation, replace that incomplete record with the final self-contained refined Markdown task. Preserve the current refine protocol's strict final-confirmation validation.
- On successful refinement, commit the todo and all completed refiner/preflight session logs in an initial `docs: add refined task` commit. This applies both to a dev-flow-owned refinement and to standalone `./refine PROMPT`.
- Successful standalone `./refine PROMPT` is planning-only: it leaves the committed todo for a later `./dev-flow --task ./tasks/<hash>-todo.md` handoff rather than marking it done.
- On failed or cancelled refinement (or any later failed stage), fail fast, preserve all generated logs and leave the task named `-todo.md`. Do not make an extra diagnostics-only commit; the incomplete todo and/or logs may remain uncommitted for inspection.
- After successful implementation, rename—not copy/delete—`tasks/<hash>-todo.md` to `tasks/<hash>-done.md` and retain it permanently. The rename must be part of the implementation commit, along with its implementation artifacts.

### 3. Session transcript capture

Capture **every actual `mswea` invocation** launched by the flow, including conditional and helper-script invocations. This includes refiner rounds, preflight sync conflict resolution, implementation, commit agents, coverage assessment, test fixers, reviewer/fixer loops, and merge conflict resolution. Refactor/wrap invocation paths as necessary so direct helpers only capture when task context has been supplied by dev-flow; their existing standalone behavior without task context must remain intact.

- Store transcripts under `tasks/` using these stable role tokens:
  - `refiner`
  - `sync-conflict-resolver`
  - `implementer`
  - `committer`
  - `coverage`
  - `test-fixer`
  - `reviewer`
  - `review-fixer`
  - `merge-conflict-resolver`
- For a role that appears once, use exactly `tasks/<hash>-session-<role>.md` (for example, `tasks/a828b9-session-refiner.md` and `tasks/a828b9-session-implementer.md`).
- For a repeated role, preserve every attempt with deterministic, zero-padded numbering: `tasks/<hash>-session-<role>-01.md`, `...-02.md`, etc. If the second occurrence makes a role repeated, rename the prior unsuffixed artifact to `-01.md`; no transcript may be overwritten.
- Each `.md` transcript must start with generated Markdown metadata sufficient to understand it independently: role, attempt, selected model, invoked command, start/end information, and exit status. Follow the header with the unmodified combined stdout/stderr stream from that `mswea` execution. Capture output whether the agent succeeds or fails.
- Do not make a new general shell-command log format. Ordinary Git/worktree/test/lint command output is not a durable task transcript; retain concise failure diagnostics on stderr and preserve existing temporary test/lint handoff behavior.
- Suppress normal child output from the user-facing dev-flow terminal while recording agent output. On an error, report a concise failure diagnostic to stderr and leave the complete agent transcript in its task file.
- Allocate the ID before `git-sync` and carry preflight sync-conflict artifacts into the task worktree and lifecycle. Likewise capture merge-conflict sessions under the same ID. All actual agent work for one flow must share one task prefix.

### 4. Commit/artifact boundaries

Session outputs are durable, version-controlled repository artifacts, not merely local diagnostics.

- The initial task commit contains the final todo plus complete refiner and preflight session logs.
- The implementation commit contains the complete implementer and committer logs, the todo-to-done rename, and related implementation artifacts.
- Coverage, test-fixer, reviewer, review-fixer, later committer, and merge-related logs must be included in their relevant implementation or follow-up commits rather than left untracked.
- Because a committing agent's final output only exists after it exits, amend the applicable just-created commit after a session/batch when necessary so that commit includes the complete transcript. Do not create separate observability-only commits merely to add logs.
- Preserve the intended existing checkpoint semantics: update/re-establish `git-save` checkpoints at appropriate boundaries so task commits remain separate from implementation work and existing `git-commit` behavior does not discard task artifacts.

### 5. Progress UI

`dev-flow` must no longer forward raw child/agent output during normal operation. Provide a dependency-free ASCII orchestration checklist/progress display with each stage visibly completed, current, upcoming, or skipped. It must expose known substate and loop iteration without attempting to parse private agent reasoning.

Use this ordered lifecycle:

1. allocating task ID;
2. synchronizing;
3. creating worktree;
4. refining (include round number), or explicitly skip it for `--task`;
5. committing task artifacts (or mark appropriately already committed for a validated pre-refined task);
6. implementing;
7. committing implementation/done artifacts;
8. ensuring tests, with coverage assessment, shell checks, and fixer attempt number when needed;
9. reviewing, with review/fix iteration number and re-check state;
10. merging, including conflict-resolution substate if used; and
11. complete.

Conditional stages begin as upcoming and must become explicitly skipped when not needed, rather than silently disappearing. In a TTY, redraw a single updating checklist/progress line. When stdout is not a TTY (including CI/piped output), emit equivalent readable newline state-transition records. Keep the display concise and do not add dependencies.

### 6. Compatibility and failure constraints

- Preserve model selection: default remains `codex:gpt-5.6-luna@high`; `DEV_FLOW_MODEL` is resolved once at dev-flow's boundary and propagated through all child helpers/agents. Standalone refine continues to honor `REFINE_MODEL` before falling back to `DEV_FLOW_MODEL`/the default.
- Continue to use repository-root discovery and safe paths/quoting. Validate task paths before acting on them.
- Ensure task context can travel through linked worktrees and back to the primary worktree without leaking unrelated files or breaking merge-lock/conflict behavior.
- Fail at the first failing orchestration stage. Preserve the todo state and every completed/failed transcript; do not falsely report completion or convert the task to done.
- Do not change product application behavior; this task is limited to the development/refinement orchestration scripts, task artifacts, and their tests/documentation as needed.

## Acceptance criteria

1. `./dev-flow "a task"` always allocates one six-hex ID, refines before implementation, commits `tasks/<id>-todo.md` and the refiner/preflight transcripts, completes the flow, and leaves a committed `tasks/<id>-done.md` rather than the todo.
2. `./dev-flow --refine-auto "a task"` behaves silently and identically; `./dev-flow` with no prompt fails clearly.
3. `./refine "a task"` creates and commits a final todo plus all per-round refiner transcripts after final confirmation; an interrupted/failed refinement leaves its explicitly incomplete todo/logs uncommitted and does not claim success.
4. `./dev-flow --task tasks/<id>-todo.md` accepts only the strict tracked, clean canonical todo form, skips refinement, captures later sessions with `<id>`, and renames it to done after successful implementation. Invalid paths and modified/uncommitted/done tasks fail before implementation.
5. Every actual agent invocation in all normal, conditional, retry, review/fix, sync-conflict, and merge-conflict paths produces one metadata-headed combined stdout/stderr transcript with the required filename/attempt semantics. Repeated roles preserve and number all attempts, including renaming a previous unsuffixed first attempt.
6. Complete transcripts are committed at the prescribed initial/implementation/follow-up boundaries, using amendments where required; no success path leaves task session artifacts untracked and no separate logs-only commit is created.
7. A stage failure stops the flow, leaves `-todo.md` (never `-done.md`), retains the failed transcript, and does not create a diagnostics-only commit.
8. Interactive output is an updating ASCII progress checklist and non-TTY output is readable newline progress records. Both identify completed/current/upcoming/skipped stages and known round/attempt/review substate; raw agent output is available in task session files rather than forwarded.
9. Existing and new automated tests cover argument modes, ID/task validation, refine lifecycle, transcript capture/naming/metadata, commit boundaries, failure behavior, model propagation, and TTY/non-TTY progress behavior. The repository's applicable test and lint commands pass.
