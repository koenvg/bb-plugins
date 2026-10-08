# Design

## Context

See `proposal.md` for motivation. The existing observer already owns native run identity, authoritative status reconciliation, and terminal cleanup. Its `shape()` result uses `backgroundTask`, `local_subagent`, pending item status, and `skipTranscript: true`.

Inspection of installed BB 0.45.0 source maps found that `packages/db/src/data/events.ts`, in `listActiveBackgroundTaskCountsByThreadIds`, counts pending background items only when `skipTranscript` is false or absent. The published delta contract requires the boolean field. BB's frontend considers `activity.activeBackgroundAgentCount` when determining whether a thread has work. The installed fork bundle also contains `skipTranscript: true`.

Existing observation and bridge tests verify pending items, stable identity, terminal settlement, and closed parent turns. They do not assert count eligibility. These facts establish a payload mismatch, not a live acceptance pass. A design is needed to resolve the interaction between transcript visibility and native counting, and to separate local payload checks from installed acceptance.

## Goals / Non-Goals

**Goals:**

- Correct the native task payload at its existing construction point.
- Exercise both observer output and the scripted bridge path without copying BB's counting implementation.
- Confirm server activity and visible background work in installed acceptance.

**Non-Goals:**

- Change normal parent turn translation, Pi completion notifications, run reconciliation, or the detailed Subagents panel.
- Add a custom working flag, synthetic turn, keepalive loop, BB child thread, or BB core patch.
- Guarantee a specific literal status label or claim lifecycle retention from a payload assertion.

## Decisions

### Use countable native items

Set `skipTranscript: false` in the observer's background item shape. Preserve existing identity, task type, status, and attachment behavior. The same shape is used for progress and terminal updates, so do not add a second activity item per run.

This permits BB's normal background task rows alongside the detailed Subagents panel. Hiding those rows with `skipTranscript` would again exclude the work from BB's count. A frontend-only badge would not fix native accounting. Holding a parent turn open would misrepresent Pi execution and violate existing turn-boundary requirements.

### Keep regression tests at the current boundaries

Extend `observation.test.ts` to assert countable pending and terminal payloads while retaining the closed-parent-turn, stable-ID, and one-time settlement assertions. Extend `bridge.subagents.test.ts` so the scripted RPC child and SDK assembler preserve `skipTranscript: false` through the full provider bridge. Cover two independent background roots in the observer fixture, then reuse existing descendant, failure, and disposal coverage rather than rebuild the reconciliation tests.

Do not introduce a fake copy of BB's SQL count as proof. The local tests guard the known prerequisite; installed acceptance reads BB's actual thread activity and observes its background-work display. No new dependency is needed.

### Supplement the pending capability without replacing it

`pi-subagents-lifecycle` exists only in the active `pi-subagents-provider` change. This change uses that same capability path with a distinct ADDED requirement, `Countable async subagent activity`. It preserves the existing lifecycle purpose and pending requirements. Integration must retain both changes' non-overlapping requirements when they are archived.

## Risks / Trade-offs

- Native rows add a compact second presentation beside the panel. Accept normal BB rendering; do not add hiding logic that removes count eligibility.
- A countable item alone does not prove session retention or completion delivery. Retain the original change's lifecycle acceptance gates and report unrun checks as blocked.
- Live checks require installation and bounded agent-work approval. Run local checks first; record exact source and versions before installed acceptance.

## Migration Plan

No data migration is required. During apply, pass package tests, typecheck, the read-only SDK compatibility gate, and build before requesting an approved update of the installed fork. Verify source identity before the live check. Restore the previous approved fork build if rollback is needed; do not change the bundled provider, default selection, or session files. Do not rewrite retained historical task items or count terminal history as new live work.
