# Tasks

Tasks is a Linear-style tracker inside bb for planning work, delegating it to
agents, and keeping the task record connected to the threads doing the work.
It provides projects and folders, task keys, statuses and priorities, labels,
subtasks, Markdown comments, attachments, agent presets, and a full CLI.

The package targets BB 0.45 and SDK 0.6.15. Presets support provider-defined service-tier ids. Migration 11 preserves saved presets and removes the old default/fast database constraint. Orchestration activation and native-origin reporting remain restricted to their earlier verified Pi/BB 0.44 path pending [BBP-140](bbtask://BBP-140). See [the compatibility report](../BB-0.45-COMPATIBILITY.md) for tests and deployment limits.

## Manual-first orchestration

The bundled `bb-orchestrator` skill reads compact status and manages approved scope records. Begin/resume require the retained exact invocation and native BB approval. Pause changes the scope record only. These controls do not start, stop, resume or send input to workers. Scope pause does not cancel native queue work.

New orchestrator dispatch/adoption entrypoints return `deferred` before claim creation or execution. Reports store outcomes and linked non-notifying comments, with delivery `suppressed`. Automatic notifications, answers, artifact delivery and integration-role execution are deferred. The skill does not use ordinary Tasks or thread APIs to recreate them. Existing operator-led Tasks worker controls and `comment --notify` stay separate and unchanged.
The approval form shows a readable scope/execution summary and a visible full-access warning. Editable JSON, full IDs and fingerprints stay in expandable technical details. `Approve scope` or `Resume scope` and `Cancel` remain outside those details. Display labels do not alter the exact submitted proposal or grant authority. See [run controls](skills/bb-orchestrator/references/run-controls.md#approval-form) and [UI validation limits](orchestration/approval-ui-verification.md).

Read [run-control commands and limits](skills/bb-orchestrator/references/run-controls.md). The temporary boundary trusts BB-recorded user classification, not proof of human identity. BB 0.44.0 can classify agent self-sends as user/null. Tracker task BBP-51 is the separate investigation follow-up. Publishing, merges, production and scope additions still need separate approval.

Read [scope controls and limits](skills/bb-orchestrator/references/run-controls.md) and [stored worker reports](skills/bb-orchestrator/references/worker-reports.md). Production reporting enables only the previously verified Pi native-origin storage path on BB 0.44.0. Other providers/versions refuse new native issuance. CLI identity cannot mint a capability. Isolated SDK tests are not fresh installed support.

Migrations 8/9/10 retain run requests, ownership/claim history, reports, private contexts and earlier private receipt intents. The runtime creates no new receipt intent and never replays or settles historical deliveries. Reload presents active scope as interrupted without changing workers.

The two historical post-pause notice executions remain failed evidence. Their cause is not proved and this cut does not repair that path. The original isolated fixture must keep its paused loaded gate and hold until separate cleanup approval. Plugin unload can remove a guard without cancelling previously accepted native work. No new native fixture is part of this release.

## Install

Install Tasks from the official plugins that BB includes:

```sh
bb plugin install tasks
```

The plugin adds the Tasks sidebar panel, the `bb tasks` command, and an agent
skill that teaches workers how to report progress back to tasks.

### Replace the bundled plugin with this fork

This fork has the plugin id `tasks-plus` and keeps the `bb tasks` command.
Only one of the two plugins can be enabled at a time.

1. Back up the bundled data:
   `cp -R ~/.bb/plugins/tasks ~/.bb/plugins/tasks.backup-$(date +%F)`
2. From this repository's root, install the fork, then keep it disabled:
   `cd bb-plugin-tasks-plus && npm ci && bb plugin build && bb plugin install . --yes && cd ..`,
   then `bb plugin disable tasks-plus`.
3. Disable the bundled plugin: `bb plugin disable tasks`. Do not use
   `bb plugin remove tasks`.
4. Copy the data: `bb-plugin-tasks-plus/scripts/import-bundled-data.sh --from
~/.bb/plugins/tasks.backup-<date>`. The script stops if the fork already
   has tasks. Set `BB_DATA_DIR` if bb does not use `~/.bb`.
5. Enable the fork: `bb plugin enable tasks-plus`. Check `bb tasks list` and
   the Tasks panel.

Rollback:

1. `bb plugin disable tasks-plus` (or `bb plugin remove tasks-plus`).
2. `bb plugin enable tasks`.

The import does not change `~/.bb/plugins/tasks/`. If that folder is damaged,
restore it from the backup. Changes made in the fork do not go back to the
bundled plugin.

The import rewrites attachment download links in copied task descriptions and comments
to `tasks-plus` routes. It leaves the bundled database unchanged.

## Quick start

After installing this fork using the steps above, use the `bb tasks` CLI to
create a tracker project. Link it to the bb project where delegated agents
will run:

```sh
bb tasks project create \
  --name "Product" \
  --prefix PROD \
  --link-bb-project proj_your_bb_project

bb tasks create \
  --project PROD \
  --title "Ship task delegation" \
  --description "Implement the flow and run focused validation." \
  --priority high

bb tasks list --project PROD
bb tasks show PROD-1
bb tasks preset list
bb tasks delegate PROD-1 --preset "GPT-5.6 · high"
```

When the CLI runs inside a linked bb project, `create` and `list` infer the
tracker project, so `--project` can be omitted. Task keys are case-insensitive
at the CLI boundary. You can also delegate from a task's **Delegate** menu,
choose or create presets under **Manage → Presets**, and type `@` in the bb
composer to send a task mention to an agent.

The comment composer shows a **Notify last responding agent** switch. When the
task has an agent reply, leave it on to send the new comment to the thread that
authored the latest reply, resuming that thread when it is idle. Turn it off to
keep the comment in Tasks only. If no agent has replied, the disabled control
says so explicitly. Agents and scripts can use the same behavior with
`bb tasks comment PROD-1 --body "New context" --notify`.
When run from a thread, the CLI preserves that agent thread and any explicit
`--author`; notification still targets the prior latest responder rather than
the newly recorded agent comment itself.

## Scan task lists

List rows keep labels out of the table at every width. Labels remain available
in the filter bar, the row's Labels context menu, the selected row's L shortcut,
and task details. Board cards still show their labels.

In a narrow panel, including desktop split view, the status and medium-weight
title lead the row. The key, priority, progress, and other metadata share a
smaller secondary line when they fit. Long titles and dense metadata wrap;
rows are not limited to a fixed height. Wide panels use a compact single line.
Touch targets and readable text sizes remain intact.

## Live thread activity in lists

All tasks, project lists, Active tasks, and expanded subtasks show the current
execution of every attached thread. For example, `2 Working · 1 Idle` counts
both active and idle workers. `1 Failed · 2 Working` keeps a failure visible even
while other workers continue. Summaries show at most two status buckets, with
`+N more` for the remaining threads. Open the summary to inspect every thread's
title, ID, preset, and Starting, Working, Idle, Failed, Removed, or Unavailable status.

Archive state is separate from activity. `1 Failed · 1 Idle · All archived`
means both existing threads are verified archived, including the failed worker.
Mixed states show a verified count such as `1 archived`. Unknown existence or
archive information prevents the all-archived claim and shows Archive unavailable.
Removed attachments do not count as archived; removed-only tasks show `N Removed`.
The drill-down identifies Archived, Not archived, or Archive unavailable for each
remaining thread. Confirmed deletion or BB's explicit not-found response shows
Removed with its retained title and ID, without a link to a deleted thread. Other
lookup errors stay Unavailable, even if their message says "not found".
Archiving never dims the task or hides its title.

Click or keyboard-activate the summary, then follow a thread link to open it in
BB without opening the task. Escape closes the popover or compact drawer and
returns focus to the summary. Row navigation shortcuts pause while it is open.
At constrained widths, metadata wraps below the title.

The overview reads current BB execution and archive/deletion fields rather than cached attachment status.
An unreadable item is Unavailable, never assumed idle or complete. Initial reads
show Threads loading. A task with no attachments has no summary after loading.
Lists refresh on Tasks invalidation, manual refresh, reconnect, and every 60
seconds while mounted. Only displayed parent/subtask rows are enriched, in
batches of at most 500 unique task IDs, with at most eight simultaneous SDK reads.
Repeated thread IDs, environments and metadata reads share settled success, absence
and failure across every sequential chunk of a list refresh. GitHub Insight availability
is checked once per refresh. The next independent refresh reads authoritative sources
again. Chunk sessions end with the load and release on scope change or unmount;
disconnected sessions expire after 60 seconds. The host retains at most eight sessions
and 4096 combined thread, environment and metadata observations per session. All SDK
reads share the eight-read concurrency limit. Capacity or expiry failures remain explicit
and keep available thread and PR identities.

Task workflow, Active-list selection, filters, board cards, CLI and detail responses
are unchanged. Archive, unarchive, deletion and PR updates use the same mounted refresh.
A failed refresh keeps thread and known PR identities but clears current activity,
archive and PR lifecycle claims. Reading status never completes a task, edits
attachments, archives a thread, or changes PR or review state.

## Linked PRs in lists

PR summaries read Draft, Open, Merged and Closed lifecycle from BB's environment lookup.
Optional GitHub Insight version-1 summaries add checks, reviews and merge blockers for attached threads,
including archived threads. Tasks works when GitHub Insight is absent or disabled, or
its detection/metadata reads fail. Basic lifecycle, links and thread/archive information
remain available. The overview makes no per-row GitHub detail, `gh` or GraphQL requests
and adds no global or archived-thread GitHub polling.

One PR has a direct GitHub link such as `PR #42 · Checks failing`. Draft remains the
principal label, for example `PR #42 · Draft, checks failing`. A separate Details control
opens simultaneous check/review conditions, Conflicts, Unresolved comments, Behind,
Other merge blockers and queue activity, plus counts, reported names, observation time,
condition codes, additive decisions and every associated thread. Merged/Closed remain
principal lifecycle labels; obsolete terminal blockers do not become current problems.

Several PRs show a distinct total and at most two primary buckets, for example
`3 PRs · 1 Checks failing · 1 Awaiting review · +1 more`. Each PR contributes to one
primary bucket, ordered by conflicts, failing checks, requested changes, other blockers or
queue failures, running checks, pending review, unresolved comments, behind, queue activity,
then Ready to merge. The highest known problem stays textual beside merged outcomes.
Secondary conditions remain in drill-down. A shared PR counts
once by canonical GitHub URL and retains all attached threads. Equal numbers in
different repositories are separate PRs.

Details stale means open/draft observations are older than one hour. They cannot provide
current check/review claims, even on archived threads. Valid terminal summaries can be
reused at any age unless superseded. Metadata observation time is separate from host
PR updatedAt. Freshness is re-evaluated while mounted, including during slow or failed
refreshes. Retained old counts are labelled Last reported, not current in drill-down.

Details unavailable identifies absent/disabled integration, detection/read failures,
malformed metadata, unsupported versions, producer refresh errors or unresolved conflicts.
Details incomplete keeps usable known conditions while identifying partial reads,
unsupported condition codes or queue information, missing prerequisites and contradictory
reported counts. Aggregate quality counts such as `1 details unavailable` are separate
from primary status counts.

Ready to merge requires an Open, non-draft PR with fresh validated version-1 evidence,
an explicitly empty blocker list, complete check/reviewer counts with no failures,
cancellations, running checks, pending reviews or requested changes, and an explicitly
null queue. Reported names and additive merge/review decisions must not contradict that
evidence. Missing fields are not defaulted into success. Stale, errored, malformed,
unsupported, partially read or conflicting details never establish readiness. Host Open
alone never establishes readiness, and retained results lose readiness as they age even
while a refresh is pending or fails.
Current host associations must also be confirmed for that canonical PR. A failed thread
or environment PR read, or a Removed thread with retained metadata, makes the affected
Open PR's details incomplete. PR identity, known problems and terminal fallback remain.
An unrelated unavailable attachment does not suppress a separately verified Ready PR.

Additive queue metadata does not require queue controls or a separate feature to ship.
Recognized states display Queued, Queued, awaiting checks, Queued, merging or Queue failed.
Any nonempty queue information suppresses readiness, even with empty ordinary blockers.
Unknown fields/states expose incomplete detail and bounded reported queue evidence.
No merge, review, archive or task-completion actions are added.

Same-PR observations reconcile using decisive newer valid evidence. A current host
absence or different-PR association supersedes a former summary. Rich counts apply only
to a compatible canonical identity and lifecycle; unresolved conflicts or unorderable
malformed evidence stay unavailable rather than selecting an attachment by order.

Initial reads show PRs loading. The summary disappears only after completed reads
confirm absence for every attachment. A partial result keeps known PRs and a count
such as `1 lookup unavailable`; a merged PR cannot hide that uncertainty. PRs
unavailable means lookups could not establish any PR identity, not confirmed absence.
Conflicting observations without a newer authoritative lifecycle show Lifecycle
unavailable and keep the link. Failed transport refresh also clears lifecycle claims
while retaining known links until the next successful read.

Activate the summary with pointer, touch or keyboard to open its popover or compact
drawer. Escape returns focus to the control. PR links open GitHub in a new tab;
thread links open BB threads. Neither opens the task. The rest of the row, editing
controls, selection and subtask expansion still work. These summaries apply equally
to All tasks, project lists, Active tasks and visible filtered subtasks. Dense metadata
wraps beneath readable titles and retains thread failure/archive cues using BB theme tokens.

## Save and draft safety

Switching tickets or leaving detail for another Tasks destination waits for the
current ticket's pending description, title, and property saves. Rapid destination
changes use the latest request. A failed save keeps the ticket and latest draft
editable, with a visible **Retry** button. Clean navigation needs no confirmation.
The remembered project or All choice changes only after saving succeeds and the
requested Tasks route is accepted, not when navigation is first requested.

Filters, sort, subtask expansion, and row-property writes also wait for pending
editor saves before changing the list or its saved preferences. If a refresh
removes the selected row while saving fails, the originating row and editor stay
accessible until Retry succeeds.
Removing the last project follows the same rule: the empty-project screen waits
until pending saves succeed and the selected route clears.

Unsent comment text, staged files, and the notification switch stay with each
ticket while the Tasks panel remains mounted. Switching never posts a comment,
uploads staged files, notifies an agent, or delegates work. An explicit send or
upload that finishes after switching still belongs to the original ticket.

Comment drafts are memory-only. Closing the panel or reloading the browser can
lose them. Leaving BB or closing the panel is not an awaited-save guarantee.
Standalone links and thread-side detail keep the same editor and explicit actions.
See [the transition contract](views/detail/README.md) for workspace integration.

## Compact epic status

```sh
bb tasks orchestrate status PROD-1
bb tasks orchestrate status PROD-1 --json
bb tasks orchestrate status --help
```

This read works before a run exists. It does not create runs, workers, messages,
comments, or ticket changes. The JSON response is the `orchestrateStatus` RPC
result: `{ "ok": true, "status": { ... } }`. The RPC input is `{ "epicId":
"<task ULID>" }`; the CLI also accepts a case-insensitive task key.

`status.epic` and every member of `status.subtasks` include identity, ticket
status, complete native prerequisites, native readiness, ownership, primary
workers, other attached workers, activity, attachment references, latest explicit
outcome, dispatch claims, artifact-handoff state, and pending decisions.
`totals` describes subtasks only. `run` and `acceptance` are separate sections.

- `nativeReadiness: "ready"` means no native blocker is open. As in existing
  Tasks commands, both `done` and `canceled` resolve a native dependency. This
  does not authorize dispatch or establish delivery of a prerequisite artifact.
- Idle, missing, deleted, and failed worker activity never changes ticket status.
  `ownership: "resolution_needed"` flags existing attachments or recorded agent
  work without a designated owner. `unknown` does not mean untouched or safe to
  spawn. An attached legacy worker is not automatically adopted as an owner.
- Missing run, ownership, claim, report, decision-report, or acceptance extensions
  return `unknown` with an explicit reason. Only an authoritative extension can
  return `absent` or `present`. Comments and attachment filenames are not reports;
  thread metadata is not authorization. All subtasks being done is not epic
  verification, even if the epic ticket itself is also done.
- A completed prerequisite without report support has an unknown handoff. A
  canceled prerequisite retains an explicit handoff-decision reason. Native open
  blockers override a reported ready handoff.

### Bounds and external observations

A complete response supports 100 subtasks and 128 KiB of UTF-8 JSON, including
the result envelope. Required task identities, statuses, prerequisites, ownership,
claims, and run membership are never silently shortened. Overflow returns
`ok: false`, code `epic_status_size_limit`, and counts for subtasks, prerequisites,
and worker associations. Byte overflow also reports `requiredBytes`. There is no
partial dispatch frontier. CLI failures exit 1; `--json` preserves the error and
counts. The snapshot is information, not dispatch permission.

Auxiliary lists return `items`, `total`, and `omitted`. Per task, at most five
other workers and five attachments are included. Report result references,
baseline/evidence references, and decision lists are capped at five. References
longer than 1024 UTF-16 code units are omitted, not shortened into invalid IDs or
URLs. Text excerpts are capped at 240 Unicode characters and return
`totalCharacters` and `omittedCharacters`. Primary owners are required state and
are not dropped by the other-worker cap. If the initially capped payload still
exceeds the byte limit, `auxiliaryReduced: true` removes auxiliary lists and text
while retaining counts and the full required state. An oversized required state
still fails honestly.

`tasksObservedAt` describes a single Tasks read transaction. `generatedAt` marks
response generation, not an atomic cross-store snapshot. External reads inspect
at most 100 distinct selected workers, primary owners first, with four concurrent
worker lookups and a two-second timeout per SDK call. No reconciliation writes,
new scheduler, or polling loop is added. `external.omittedWorkers` counts selected
workers beyond that lookup budget; per-task list overflow covers unselected
attachments. The SDK's interaction-list operation has no pagination/limit option,
so the command caps the returned projection, not the BB transport response.

Each worker has separate activity and native-interaction observation timestamps.
Unavailable activity is unknown and retains the existing lifecycle cache as stale
context. `cachedAt` is the native association's `updatedAt`, not a promise of a
fresh external observation. The old cache value `completed` can mean missing or
deleted, never ticket completion. Missing and deleted workers have unknown
interaction state. An unavailable decision lookup has null totals, not zero.
`nativeDecisions` aggregates known pending/resolving questions per task with
`knownPending`, `omitted`, and `unobservedWorkers`; partial coverage cannot prove
there are no other questions. It remains visible even when auxiliary worker lists
are removed. Free-form reported questions remain separate in `reportedDecisions`.

### Tasks-owned extension contract

Later slices supply `StatusOptions.readCoordination`, exported from
`orchestration/index.ts`. Pass the same options to `registerOrchestrationStatus`
argument 3 and `registerTasksCli` argument 4. The reader signature is
`(epicId, taskIds) => CoordinationSnapshot`; `taskIds` includes the epic and its
current direct subtasks. It runs synchronously inside the native Tasks read
transaction. It must perform bounded Tasks-owned reads only, with no writes,
external calls, comment reconstruction, or metadata-based authority.

`CoordinationSnapshot` and `TaskCoordinationData` in
`orchestration/status-contract.ts` are the exact typed contract:

- `run` has ID, phase, coordinator thread ID, complete approved task IDs,
  `scopeState` of `current`, `changed`, or `unknown`, and baseline references.
- The per-task `tasks` map can supply explicit `ownership`, unresolved `dispatch`
  claims, `latestOutcome`, `handoff`, and unresolved `reportedDecisions`.
  Ownership references use native association ID, thread ID, and the role
  `implementation`, `orchestrator`, or `integration`. The projection checks each
  primary owner against the current native task/thread association. Detachment
  produces unresolved ownership; it does not remove a separately recorded claim.
  Each primary role and each primary association ID may occur only once per task.
- Explicit outcomes carry report, comment, and thread IDs, outcome kind,
  creation time, summary, and result references. No outcome changes ticket status.
- `acceptance` carries report and thread IDs, the explicitly recorded outcome
  `verified`, `failed`, or `unverified`, baseline references, and evidence
  references. The projection does not verify evidence or derive acceptance.

Availability-bearing sections use `unknown` plus reason, `absent`, or `present`
plus value. Omitted fields default to unknown, not absent. Invalid/conflicting
required extension state returns `epic_status_extension_invalid`, not a partial
frontier. The initial status slice adds no migrations and no run/report/claim
registry. Actual persistence, run activation, safe dispatch, answer routing, and
acceptance verification belong to later slices. Extension fixture tests prove the
projection contract only, not real provider activation or stored report evidence.

## Deferred dispatch and retained history

`orchestrateDispatch` and `orchestrateAdopt`, and their CLI forms `orchestrate dispatch` and `orchestrate adopt`, retain strict input validation but return `outcome: "deferred"`, a manual-first reason, null thread/claim and no candidates. They do not perform eligibility lookups, allocate claims, adopt owners, attach workers, seed, spawn or continue work. This applies to approved, paused, interrupted and historical retry contexts.

Migration 9 ownership and claim records remain readable. Detachment preserves original owner/claim identity. The integrated BBP-37 bookkeeping recovery commands retain original-child precedence and live/released history. They never send, resume or replace a child automatically.

`createDispatcher(..., {readHandoffs})` retains the synchronous coordination-reader extension. Scope, roles, claims and reports feed the same bounded read transaction; handoff/acceptance claims remain unknown unless an authoritative record exists. Report references do not establish artifact delivery. Task done/canceled status does not establish epic acceptance.

Historical dispatch verification is in [the original evidence notes](orchestration/dispatch-verification.md). It is not acceptance of the removed automation. Current no-agent-input tests exercise production registration, scope controls, deferred CLI/RPC calls, report tool/CLI/RPC retries, reload and retained delivery intent history.

Combined retained-feature checks and support limits are in [manual-first acceptance](orchestration/manual-first-verification.md). The exact final commit and single whole-feature review are attached to BBP-42.

## Interrupted dispatch recovery

Use `bb tasks orchestrate reconcile`, `link`, and `resolve` for the exact original task/run/claim. Read [recovery commands, operator decisions and safe disable/rollback order](skills/bb-orchestrator/references/recovery.md) before using them. These commands do bookkeeping only. They do not spawn, seed, send, resume or delete workers. Recovery can attach an already active original while keeping its run paused or interrupted.

Recovery uses migration 9 without a new schema migration; stored reports add migration 10. `DispatchStore.latest` reads the newest task/role attempt; `release` clears only its primary designation inside the caller's transaction and preserves the old claim/association. `RunController.requireContext` validates original scope and returns the effective phase without granting execution. `Dispatcher.recovery` owns the three bookkeeping handlers. Even an exact recorded release grants no execution; every new dispatch/adoption remains deferred.

See [recovery verification and native fixture limits](orchestration/recovery-verification.md). The installed checkpoint recovered the same child after injected local response loss and reload. It also exposed an unsafe fixture disable order: removing a gate while a seed remained queued let BB drain already accepted core work. Cleanup stopped/archived the child and removed its queue. Corrected cleanup-before-disable retained a paused run and empty queue. Disable is not cancellation; enable is not authority to resume.

## CLI reference

Run `bb tasks --help` or `bb tasks <command> --help` for exact options; help
works at every level, lists each option's accepted values and limits, and exits 0. Unknown commands and options are rejected with the nearest real name, every
missing required value is reported in one error, and a failing invocation that
carries `--json` prints `{ "ok": false, "error": { "code", "message", "hint"? } }`
on stdout while stderr keeps the readable text. Add `--json` to commands when
another command or agent will consume the output.

`--project` takes a tracker project prefix or id such as `PROD`, never a bb
project id (`proj_...`); `bb tasks project list` shows both columns. Repeatable
options (`--label`, `--status`, `--priority`, `--add-label`, `--remove-label`)
also accept one comma-separated list. File paths (`--file`, `--attach`,
`--out`, `--description-file`, `--body-file`) resolve on the invoking machine:
inside an agent thread that is the thread's machine, otherwise the server's
machine; pass `--machine <id-or-name>` to target another enrolled machine.

| Command                                        | Purpose                                                                                                                                                    |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bb tasks status`                              | Show the installed Tasks plugin name and version. Task workflow status lives on `bb tasks list --status` and `bb tasks update --status`.                   |
| `bb tasks project create\|list\|show\|update`  | Manage tracker projects, folders, colors, prefixes, and bb-project links.                                                                                  |
| `bb tasks folder create\|list\|update\|delete` | Organize tracker projects into nested folders. Deleting a folder moves its projects and subfolders to the top level; no tasks are deleted.                 |
| `bb tasks create`                              | Create a task with description, priority, labels, due date, optional parent, and file attachments (repeatable `--attach <path>`).                          |
| `bb tasks list`                                | Page/filter tasks by project, status, priority, label, active agents, search text, or `--ready`/`--blocked`; supports `--sort`, `--limit`, and `--cursor`. |
| `bb tasks show <key-or-id>`                    | Show the complete task record, including blockers, blocked tasks, comments, attachments, subtasks, and attached threads.                                   |
| `bb tasks update <key-or-id>`                  | Update status, priority, title, description, due date, labels, or blockers (`--blocked-by`, `--unblocked-by`).                                             |
| `bb tasks comment <key-or-id>`                 | Add a Markdown comment from inline text or a file; optionally notify the latest responding task agent.                                                     |
| `bb tasks attachment add\|get\|list\|remove`   | Add, fetch, list, or remove attachments. Referenced attachments require `remove --remove-references`.                                                      |
| `bb tasks preset list\|create\|update\|delete` | Manage reusable agent execution presets.                                                                                                                   |
| `bb tasks delegate <key>`                      | Start and attach a new agent thread using a preset.                                                                                                        |
| `bb tasks attach <key-or-id>`                  | Attach the current bb thread to a task when it was not delegated from Tasks.                                                                               |
| `bb tasks detach <key-or-id>`                  | Detach the current bb thread (or `--thread <id>`) from a task, when the user explicitly requests removal of the link.                                      |
| `bb tasks threads <key>`                       | List the bb threads attached to a task: live threads first, newest first.                                                                                  |
| `bb tasks label create\|list\|delete`          | Manage project-scoped labels.                                                                                                                              |
| `bb tasks seed-demo --yes`                     | Create sample folders, projects, labels, tasks, and comments for evaluation.                                                                               |

Statuses are `backlog`, `todo`, `in_progress`, `in_review`, `done`, and
`canceled`. Priorities are `urgent`, `high`, `medium`, `low`, and `none`.

### Task dependencies

A task can be blocked by other tasks, in any project. A task is blocked while
one of its blockers is not `done` or `canceled`.

```sh
bb tasks update ABC-5 --blocked-by ABC-3      # ABC-3 must finish first
bb tasks update ABC-5 --unblocked-by ABC-3    # remove the link
bb tasks list --ready                          # tasks with no open blocker
bb tasks list --blocked                        # tasks with an open blocker
```

- `--blocked-by` and `--unblocked-by` take a key or ID and are repeatable.
- A link that makes a cycle fails, and the command saves nothing.
- `--ready` and `--blocked` cannot be used together.
- `update --status in_progress` and `dispatch` on a blocked task still run.
  They print a warning on stderr, or a `warnings` array with `--json`.
- When the last open blocker goes to `done` or `canceled`, the blocked task
  gets an "Unblocked" system comment. No thread is notified.
- The worker prompt of a dispatched task has a "Blocked by" section.

Task lists default to 100 rows and accept `--limit 1-500`. JSON output is
`{ tasks, nextCursor, limit }`; human output prints the continuation option
when another page exists. The cursor is opaque and tied to the filters, sort,
and current task-list revision. If tasks are added, removed, reordered, or
updated between requests—or label links/names, active task threads, or project
prefixes change—the old cursor is rejected. Restart from the first page rather
than traversing an inconsistent snapshot.

## Agents, delegation, and presets

Linking a Tasks project to a bb project enables delegation. Open a task, choose
**Delegate**, select a preset, and optionally add instructions. A preset
defines the provider, model, reasoning level, optional service tier, permission
mode, and reusable instructions. Presets are user-defined, so create the worker profiles your team
uses repeatedly before dispatching work.

Delegation creates a worker thread in the linked bb project, attaches that
thread to the task, and advances a `backlog` or `todo` task to `in_progress`.
The worker receives the task description, subtasks, attachments, recent
comments, preset instructions, and a report-back contract. Its installed Tasks
skill tells it to inspect the task, leave substantive milestone comments,
attach artifacts, and move completed work to `in_review`.

If work begins outside the Delegate action, the agent can associate its current
thread with `bb tasks attach KEY`. Keep task-to-thread links when work completes,
enters review, is handed off, is replaced, fails, or moves to other work. Linked
Done tasks remain visible and openable in the thread header.

Manual removal remains available with `bb tasks detach KEY [--thread <id>]`
and each thread card's detach control. Agents detach only when the user
explicitly requests removal of that task-to-thread link. Detaching does not
stop the thread or change the task status. The task page and `bb tasks threads`
list live threads before completed or failed ones, newest first.

This is agent guidance, not a server-enforced detach permission check. New
worker prompts and newly read Tasks skills use the retention rule. Previously
delivered prompts and existing detached links remain unchanged; this update
does not restore links or rewrite task histories. Retained links grant no new
ownership or reporting authority and do not dispatch work or bypass existing
orchestration checks.

## Task mentions

Type `@` in the bb composer and select **Tasks** to search by task key or title.
Sending the mention gives the agent the task's description, status, priority,
labels, subtasks, attachments, recent comments, attached threads, and CLI
action contract as context. Tasks linked to the current bb project rank first.

Inside a task description or comment, `@` also inserts a task pill. These
references are stored in Markdown as `[PROD-1](bbtask://PROD-1)`, so they remain
portable in task content.

Mentioning a task key such as `PROD-1` in an agent request also activates the
Tasks skill, which directs the worker to read and update the tracked task.

## Project navigation

Choose a project or **All projects** from the picker above the ticket list or
board. The picker shows the current scope and groups projects by folder. Nested
folders use a full path such as `Work / Products`. Changing scope restores that
scope's saved filters and sort, updates its label choices and New task default,
and remembers the accepted project or All choice.

The **Tasks navigation** menu beside New task opens **Active**, **Manage**, and
**New project**. Active always spans all projects and does not replace the
remembered scope. Under **Manage**, use **Presets** to create or edit agent presets
and **Folders** to organize projects. With no projects, the header and empty
state offer New project instead of an empty picker.

The permanent right-hand Navigation pane is no longer registered. The sidebar
count and command-palette entry points remain available. On narrow panels, long
project names truncate, New task becomes icon-only, and List/Board stays available
in Tasks navigation when the inline toggle does not fit.

## Browse and edit side by side

All, Active, and project lists fill the main Tasks area. Selecting a row opens its
existing editable ticket in BB's native right-hand **Ticket** tab, alongside the
host's Browser and Terminal tabs. BB owns pane resizing and its compact drawer;
Tasks does not create an inner split. The selected row stays highlighted, both
areas scroll independently, and selection does not focus an editor.

The detail keeps title, description, properties, dependencies, subtasks, files,
comments, linked threads, and delegation. Pending autosaves must succeed before
selection changes. Retry a failed save without leaving the originating draft.

Browse links carry optional selection, for example `all?task=TSK-2` or
`PROJECT_ID?view=list&task=TSK-2`. Selection replaces the current history entry.
A reopened browse link selects only a task present in the settled visible list.
Selection follows the rendered filtered/sorted groups, including expanded children
and dimmed parents. Loading and failed refreshes keep it. A settled filter, collapse,
edit, or deletion that removes the row safely clears selection and returns to the
selection prompt. Changing projects clears the old selection after pending saves.
Embedded subtask and dependency links select visible rows in place. Other task
links open standalone detail without changing remembered scope. Board routes,
standalone task links, mentions, CLI commands, and thread-side embeds keep their
existing destinations.

Switching to Browser or Terminal, or closing Ticket, keeps the selected editor
and its drafts alive while the Tasks page remains mounted. Reopening Ticket
returns to that editor; selecting another row deliberately reveals Ticket.
Refresh and resize do not reopen a tab you closed or move focus from another pane.
A delayed save does not undo a host-tab switch made while it was pending.

If navigation needs to save a parked editor, Tasks reveals its originating Ticket
pane so a failed save remains retryable. Inactive editor menus close and its
controls cannot claim keys. If BB declines to open the pane, the same retained
editor temporarily occupies Tasks so you can correct the draft or retry its save.
Try Ticket pane again restores native placement; Back to list remains save-guarded.

Escape from non-editable detail saves pending edits and returns focus to the
selected row without scrolling or clearing selection. BB's own controls manage
its narrow-layout drawer and tab closure; there is no plugin Back-to-list layout.

In All tasks, Active work, and project lists, activate a status header to hide or
show its rows. The full-width button supports click, touch, Enter, and Space. Its
chevron shows the section state. The header and count remain visible. Section
counts and filter counts do not change.

Sections start expanded. Each list saves its own choices on this device. All tasks,
Active work, and each project restore separate choices when you return, including
after the list unmounts. Filters, sorting, and Clear retain these choices. A section
with no matching rows returns in its saved state with its current count. A filter
that matches only a child does not open its collapsed section. Reopen the section
to see the dimmed parent and matching child. Section toggles do not change saved
subtask expansion.

Saved section choices also restore after a panel reload or app restart when browser
storage remains available. They are local to this browser profile and device, not
synced. Existing preferences without section choices keep valid filters and sorting
and start expanded. Invalid section fields use expanded defaults; unknown statuses
are ignored and duplicate choices apply once. Unsupported future preference
versions remain unchanged on disk, even if their scope format is unreadable.

Storage read or write failures do not stop section toggles in the mounted list.
These temporary choices are not guaranteed to survive navigation or reload. If
browser storage is cleared, saved section choices, filters and sorting are lost;
sections start expanded again. No server copy restores these preferences.

Hidden rows are not part of task keyboard navigation. In every list scope, Tasks
saves pending edits before a collapse hides the selected task. A failed save keeps
the section open and the draft available for Retry save. Navigation return restores
scroll against the saved section layout, even when only headers remain. Scroll
stays within the available range; hidden panes do not replace its saved position.

Long row titles and important metadata wrap in constrained list containers.
Status, priority, and expansion controls have larger coarse-pointer targets.
Board and thread-side detail layouts are unchanged.

Unsent comment text, staged files, and notification choice stay task-owned for the
mounted Tasks session. Tab switches and resize do not submit, upload, notify, or delegate.
Explicit operations finishing later still belong to their originating task.
Closing the native Ticket tab is safe; closing the Tasks page or reloading the
browser ends this session's unsent-draft retention.

## Remembered project scope

Opening Tasks without a destination restores the last Tasks project or your
explicit All projects choice. This memory belongs to the browser profile and
applies across BB projects. It does not follow the current BB project's link,
change CLI project inference, or sync to another browser or device.

- Explicit project links and **Go to All tasks** override and update that choice.
- **Active**, **Manage**, and direct `task/<key>` links take precedence without
  changing the remembered scope. A cross-project task link opens its named task
  without selecting that project first.
- First use defaults to All projects. Restoration waits for a successful project
  inventory before deciding a remembered project was deleted and falling back
  to All. Failed inventory requests offer **Retry** without erasing the choice.
- Unavailable or malformed browser storage does not block selection. Choices
  still work for the current session; future-version preference documents remain
  untouched. Storage failures can prevent persistence across a page reload.

Project list/board preferences remain separate. List filters and sort persist in
browser storage per All, Active, and project scope; they are not encoded in the
URL. Scope restoration leaves those preferences, expanded subtasks, and list
scroll preferences unchanged.

## Keyboard shortcuts

Press `?` in the Tasks panel to see every shortcut, generated from the same
shortcut definitions as the listener. Single keys do nothing while typing in
inputs or rich text, during composition, with Cmd/Ctrl/Alt held, inside another
BB pane, or while a menu or dialog is open. Escape never discards an editor draft.

| Where            | Keys                                                                                                                                |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Anywhere         | `c` new task, `?` shortcuts, `v` list or board on project routes                                                                    |
| Browse workspace | `j` `k` / `↓` `↑` select next/previous preview from either non-editable pane; `[` `]` and pager buttons use the same visible order  |
| List row         | `Enter` `o` select the row and focus its loaded preview; `s` status, `p` priority, `l` labels on the focused selected row           |
| Ticket detail    | `Esc` return to the same row; `s` `p` `l` properties, `d` dispatch preset menu, `m` comment focus                                   |
| Board            | `h` `l` / `←` `→` column, `j` `k` / `↓` `↑` card, `Enter` `o` open, `s` status, `p` priority                                        |
| Standalone task  | `Esc` back, `[` `]` previous/next in the existing standalone pager order; detail property, dispatch-menu, and comment keys as above |

Movement starts at the first row in either direction with no selection, clamps at
the ends, and waits for settled filtered/sorted order, including expanded subtasks
and dimmed parents. Tab focus alone does not change selection. Movement focuses
and scrolls the selected row. Enter waits for the selected lookup and a visible
Ticket pane before focusing its non-editable container, including on a retryable
error. Escape restores row focus without scrolling or clearing selection.

Selection and context changes wait for safe saves. Failure leaves the origin,
draft, selection, and Retry accessible. A superseded request cannot steal focus.
Property keys belong only to the focused pane, even while both panes stay mounted.
Closing help or a row menu restores its prior focus. Navigation never submits a
comment, uploads a file, notifies, or delegates.

The bb command palette (`Mod+Shift+P`) also lists **Tasks: New task**,
**Tasks: Go to All tasks**, **Tasks: Go to Active tasks**, **Tasks: Go to
Manage**, **Tasks: Show keyboard shortcuts**, and **Tasks: Switch project**.
They have no default keys;
bind your own in bb.

### Switch Tasks projects

1. Open BB's command palette.
2. Select **Tasks: Switch project**.
3. Search by project name or prefix, then select a project.

In the picker, use Ctrl+N or ArrowDown for the next result and Ctrl+P or
ArrowUp for the previous result. Navigation stops at each end. Press Enter to
select, or click a result. The current project is marked. Escape or Close cancels
and returns focus to Tasks, not to BB's command palette.

This switches a Tasks tracker project, not BB's workspace project. Pending task
edits must save before the project changes. A failed save keeps the task and draft
available for retry. The destination uses its saved list or board preference.
There is no direct board shortcut for the picker, including Shift+P.

## Known limitations

- The **Auto** delegation preset is deferred; choose an explicit preset.
- Browser preferences are local to the browser profile, not synced across devices.

## Fast follow

- Batch task-list enrichment for comments and attached-thread state.
- Add notifications and an inbox for task activity.
- Add a command palette entry for Tasks to cmd-K.
