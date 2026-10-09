# Design

## Context

- github-insight reads checks in `core/checks.ts`. A `StatusContext` with state `PENDING` or `EXPECTED` maps to `running`. A `CheckRun` that is not completed also maps to `running`.
- `latestCheckCandidates` keeps the newest node per name. A candidate has `recency`, which is the status `createdAt` for a `StatusContext`.
- `collectInsight` (`core/overview.ts`) builds checks, then blockers, then the insight. It has no clock input today.
- The insight service polls every open PR every 60 seconds (`POLL_INTERVAL_MS`). The summary is written again when its content changes.
- pr-thread-list reads the summary in `pr-insight.ts`. `tabs.ts` uses `PROBLEMS` blockers for Needs attention and `runningChecks > 0` or `WAITING` blockers for In flight.

## Goals / Non-Goals

**Goals:**

- Find a status that waits for a person with data we already fetch.
- Keep the decision in one place (github-insight), so the panel, the banner, and the sidebar agree.

**Non-Goals:**

- The review queue CI state (`core/review-queue.ts`) for PRs of other people. It keeps its own `PENDING` to `running` map.
- Learning check names from past approvals.
- A setting for the quiet threshold.

## Decisions

### 1. Decide "waiting" on the server at poll time, not in the sidebar with a clock

The rule needs the time. The server already polls every 60 seconds, so it can decide with `now` and write a new summary when a check turns waiting.

Alternative: send `quietSince` in the summary and decide in pr-thread-list with `useNow`. This puts the rule in two plugins and the PR panel would need the same rule again. Rejected.

### 2. New `CheckStatus` value `waiting`

`checkStatusSchema` gets `waiting`. A new function in `core/checks.ts` takes the latest candidates and `now`, and changes `running` to `waiting` for each `StatusContext` candidate that meets the rule in the `pr-waiting-checks` spec. The candidate needs a field that tells `StatusContext` from `CheckRun` (today `runId === null` means a status; use an explicit `source` field so the rule does not depend on that side effect).

`collectInsight` gets `now: number` from its caller (`server.ts`), so tests can pin the time.

Threshold: `QUIET_STATUS_MS = 3 * 60_000` in `core/checks.ts`. Chromatic posts "Comparing…" updates every few seconds during its work. 3 minutes is well past that and short next to a person's reaction time.

Alternative: keep `running` and add a flag on the check. Every consumer then has to know two fields. Rejected.

### 3. New blocker `checks_waiting`

Added to `blockerCodeSchema` directly after `checks_failed`. Text: `"<name> waiting for you"` for one check, `countOf(n, "check") + " waiting for you"` for more. `buildBlockers` gets the waiting check names (not only statuses) so it can build the text.

- `ui/blocker-tone.ts`: `text-attention`.
- `core/auto-merge.ts`: add to `WAITING_BLOCKERS`.
- `core/banner.ts`: show it with the check parts, before running checks.

### 4. PR panel

`ui/pr-tab.tsx`: add `waiting` to `OPEN_STATUSES` and `STATUS_ICON`. Icon: a non-spinning icon in `text-attention` (for example `Hand` or `UserCheck`, pick from the available `IconName` set). Order in the open groups: failed, waiting, running.

### 5. Summary and sidebar

- `core/summary.ts`: `checks.waiting` comes from `Record<CheckStatus, number>` with no extra code. Version stays 1.
- pr-thread-list `pr-insight.ts`: add `checks_waiting` to `BLOCKERS`. Read `checks.waiting` as optional (default 0) so a summary from an older github-insight still parses.
- `tabs.ts`: add `checks_waiting` to `PROBLEMS`.
- `pr-status.ts`: new reason `checks_waiting`, status "waiting for you", `waiting` tone, non-spinning mark. `problem` tone is too strong for a review step. Place it after `checks_failed` in `REASON_ORDER`.

### 6. tasks-plus

tasks-plus parses the summary with a strict zod schema (`prChecksSchema`) and marks unknown blocker codes as `unsupported_conditions`.

- `prChecksSchema`: add `waiting` as optional (`.optional()`), so a summary from an older github-insight still parses.
- `KNOWN` in `api/work-status-conditions.ts`: add `checks_waiting`. Also derive it from `checks.waiting > 0`, like `checks_running`.
- `CONDITIONS` in `views/list/pr-presentation.ts`: label "Checks waiting for you", rank 1.5 (after failing checks, before changes requested). "Ready to merge" also needs `checks.waiting` to be 0.
- `pr-rich-detail.tsx`: show the waiting count in the checks line.

Alternative: only write `checks.waiting` when it is above 0. tasks-plus would still reject those summaries. Rejected.

## Risks / Trade-offs

- [A slow CI system that reports with a single commit status, and is the last item left, turns "waiting" after 3 minutes] → It only applies when no check run is running. It returns to `running` as soon as that status posts an update. Accept.
- [The PR moves to Needs attention up to ~4 minutes after CI is done, not at once] → Accepted for zero setup.
- [A status that waits for someone else, not the user, shows "waiting for you"] → The thread still needs the user to follow up. Accept the wording.
- [Old tasks-plus with new github-insight] → Every summary is rejected. Ship tasks-plus in the same change.
- [Old pr-thread-list with new github-insight] → Unknown blocker is dropped and running count is 0, so the thread also goes to Needs attention. Safe.
- [New pr-thread-list with old github-insight] → No `checks_waiting`, no change in behavior.

## Migration Plan

No data migration. Ship both plugins. Rollback is a revert.
