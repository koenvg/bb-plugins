# Design

## Context

- github-insight sends one GraphQL overview query per refresh (`github/overview-query.ts`). The first page reads `mergeable`, `mergeStateStatus`, and `reviewDecision` in an `@include(if: $firstPage)` block.
- `core/blockers.ts` builds the blockers. It returns `[]` early for merged and closed PRs.
- `core/summary.ts` writes the `prSummary` thread metadata (version 1). `bb-plugin-pr-thread-list/pr-insight.ts` reads it and ignores unknown fields.
- The sidebar maps blockers to a badge (`pr-status.ts`) and to a tab (`tabs.ts`).
- github-insight supports only github.com (`pr-lookup.ts`). The `mergeQueueEntry` field is available there.

## Goals / Non-Goals

**Goals:**
- One source for the queue state: `PrInsight.mergeQueue`. The blockers, the summary, the PR tab, and the banner all read from it.

**Non-Goals:**
- No new `pr.state` value. A queued PR stays `open`.
- No queue data for the base branch (for example, the queue length).

## Decisions

### Read `mergeQueueEntry { position state }` in the first-page block
- It goes next to `mergeStateStatus`, so it costs no extra request.
- Alternative: `isInMergeQueue` plus a second query for the entry. Rejected: two fields for one fact, and a null `mergeQueueEntry` already means "not queued".

### Keep `mergeQueue` next to `pr`, not inside `pr.state`
- `PrInsight.mergeQueue: { position: number; state: "queued" | "awaiting_checks" | "merging" | "failed" } | null`.
- Alternative: `pr.state = "queued"`. Rejected: it changes the meaning of a version 1 field, so the contract would need `version: 2`, and an old sidebar would drop every summary.

### Early return in `buildBlockers`
- Add `mergeQueue` to `BlockerInput`. When it is not null, return `[]`, the same way as for merged and closed PRs.
- `core/banner.ts` already returns no banner for an empty blocker list. No banner change is needed beyond a test.

### Map `MERGEABLE` and `LOCKED` to one state `merging`
- Both mean GitHub is about to merge, or is merging. The user cannot act on the difference.

### Sidebar reasons
- `pr-status.ts` gets three reasons. They come before the blocker reasons:

| Queue state | Word | Tone | Mark |
|---|---|---|---|
| `queued` | "Queued #N" | waiting | none |
| `awaiting_checks` | "Queued #N" | waiting | `Spinner` (spin) |
| `merging` | "Merging" | ready | none |
| `failed` | "Queue failed" | problem | `CircleX` |

- The lead icon stays `GitPullRequest`. Check the icon names against `DESIGN.md` and the icon registry during apply.
- `tabs.ts`: `failed` goes to Needs attention. The other states go to In flight. These rules come before the blocker rules.

## Risks / Trade-offs

- [An old sidebar with a new github-insight shows "Ready" for a queued PR] → Both plugins ship from this repo. Release them together.
- [GitHub's `mergeStateStatus` for a queued PR is not checked on a live repo] → The early return makes it not matter for blockers. Record a real queued-PR overview response as a test fixture when one is available.
- [GitHub adds a new `MergeQueueEntryState`] → The zod enum fails to parse and the refresh shows an error. Accept this. It is the same behavior as for `mergeStateStatus`.
