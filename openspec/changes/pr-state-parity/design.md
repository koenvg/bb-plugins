# Design

## Context

See `proposal.md` for motivation. Inspection found:

- `core/overview.ts` sets `pr.state` from GitHub's lifecycle and `isDraft` independently of merge blockers.
- `core/blockers.ts` returns early for CLEAN, HAS_HOOKS, or queue membership. Draft can therefore have no blocker. With other blockers, Draft also loses to the first non-check blocker in `bannerParts`.
- `core/banner.ts` chooses merged, hidden closed, queued, blockers, ready, or hidden. It has no independent draft or actionless-open presentation.
- `ui/pr-tab.tsx` owns lifecycle labels and the four queue-detail mappings. `ui/composer-banner.tsx` instead collapses all queue entries to Queued and silently omits first-load and read-error results.
- Both views use `useInsight` and reload on `insight.updated`. They mount independently. `use-thread-result.ts` already protects thread identity and late results; there is no requirement for an atomic update across separate mounts.
- `app.test.tsx` and `core/banner.test.ts` assert hidden closed/actionless states. `ui/merge-flow.test.tsx` covers shared write progress. No browser reproduction has been run for this planning change.

The existing durable `pr-merge-actions` and `pr-merge-queue` specs govern action safety and queue data. The older `github-pr-insight` planning change contains outdated hidden-banner rules. This change updates the durable merge-action contract, not that historical proposal.

## Goals / Non-Goals

**Goals:** Keep one presentation decision for a given insight snapshot, exercise it through both UI consumers, and make state visibility independent of merge eligibility.

**Non-Goals:** Change GitHub reads, polling, blocker/summary contracts, merge policy, operation coordination, native badge suppression, or BB core. Do not implement Mark ready in the plugin or introduce a client-wide cache/state broker just for presentation.

## Decisions

### 1. Use the reported lifecycle, not blockers, for visibility

Give every good `PrInsight` a visible lifecycle. Draft and terminal states take precedence over contradictory action or queue fields. Only a good Open snapshot can provide readiness or queue progress. Keep the existing server-side action guard as well.

Do not move the Draft blocker ahead of other blockers or remove the CLEAN/HAS_HOOKS early return. Those changes would affect sidebar summaries and still confuse lifecycle with blockers. The presentation fix works even when `blockers` is empty. When the banner has a separate Draft label, omit a duplicate Draft part from its compact summary only; leave the source blocker list unchanged.

### 2. Put common presentation at one small seam

Add a pure presentation module, provisionally `ui/pr-status-view.ts`, used by the PR tab and banner. Its interface accepts `PrInsight` and returns a lifecycle label/outcome, semantic icon/tone, an optional detail message, and the currently valid merge action. It performs no reads, writes, subscriptions, or navigation.

Move the current PR lifecycle and queue-detail mappings out of `ui/pr-tab.tsx` into that module. Use `core/banner.ts` for existing compact blocker selection rather than duplicating it. Replace the current visibility-only `bannerState` decision so a null detail does not hide a known lifecycle. Keep the module local to GitHub Insight, not a general status framework.

Both UI modules render the result at this seam. The tab keeps full check/reviewer sections and its stronger merged outcome. The banner keeps a compact row. Terminal snapshots suppress obsolete queue, blocker, and readiness detail in both views. Tests cross this interface and both rendered consumers, rather than testing exported label tables alone.

Alternative rejected: add Draft and Closed branches only in the banner. That fixes some cases but leaves queue labels and future lifecycle additions split across callers.

### 3. Separate lifecycle from detail and available actions

| Input | Lifecycle/outcome | Compact detail | Merge action |
| --- | --- | --- | --- |
| Draft, no blockers | Draft | None | None |
| Draft, blockers | Draft | Existing compact summary, without duplicate Draft | None |
| Open, blockers | Open | Existing compact summary | None |
| Open, valid action | Open | Ready to merge/enqueue | Existing action |
| Open, no action | Open | None | None |
| Open, queued | Open | In merge queue (#N) | None |
| Open, awaiting_checks | Open | Merge queue checks running (#N) | None |
| Open, merging | Open | Merging | None |
| Open, failed queue | Open | Merge queue failed, problem tone | None |
| Closed | Closed | None | None |
| Merged | Pull request merged | None | None |

An absent action reason is not available in the current insight contract. Show Open without inventing a reason or changing the backend. Do not add a passed-check count to the banner in this change; the side panel remains the full-detail view.

Keep lifecycle text non-shrinking and truncate the detail first. Preserve readable text as well as tone. Put the status button and any action or retry buttons beside each other, not inside one another. Use the existing click-to-open-PR behavior and keyboard controls. Merged keeps its violet outcome icon; Draft and Closed use neutral lifecycle presentation rather than implying a failure solely from lifecycle.

### 4. Reuse result and refresh handling

At the banner's result boundary:

- `null`: show the existing loading-status style.
- `no_pr`: hide normal status, while retaining explicit palette feedback.
- `error` with no prior good result: show the message and Retry using the existing refresh callback; do not invent lifecycle or actions.
- `ok`: render lifecycle/detail. If the result also carries an error, retain the last good state and show the refresh error, last good refresh time, and Retry. While refreshing, retain known state with progress.

The server normally returns a cached `ok` result with an error after a failed refresh. A transport rejection can instead produce a bare `error` through `use-thread-result.ts`. If a good snapshot was already loaded, retain that one snapshot locally in `useInsight`, keyed to the thread, and present it with the new error and its original refresh time. Clear it on a confirmed no-PR result and a thread change. Apply this handling once in the shared hook, not separately in each renderer. This is per-mount last-good retention, not a cross-thread cache or a new source of PR data.

Keep PR-panel availability and navigation hooks mounted for all result kinds. No extra GitHub lookup or timer is added. Independent mounts can temporarily be at different read stages; after they consume the same update, presentation must agree. Keep existing request ownership and race protection rather than adding a synchronization layer.

### 5. Preserve operation feedback and host controls

Continue using `usePaletteMerge`, `MergeActionButton`, and `MergeConfirmation`. Running progress replaces the ready detail but not the known lifecycle. Existing shared operation state supplies disabled buttons, deduplication, confirmation, and head guards. Keep operation errors distinct from read/refresh errors so dismissing one does not erase the other. No feedback automatically opens a panel.

Do not edit `ui/hide-host-pr-strip.ts`. BBP-113 and `hide-native-pr-badge` own its unconditional suppression problem. This change must not worsen it. Host integration evidence must confirm file controls and an offered Mark ready control remain usable. If the existing CSS blocks those controls in the verified build, report the external acceptance gap and its owner; do not silently expand this implementation.

## Risks / Trade-offs

- More visible rows above the composer can add noise. Keep known status compact, hide it for confirmed no-PR results, and show full detail only in the panel.
- Stale snapshots can contain inconsistent fields. Lifecycle guards in the shared presentation prevent Draft, Closed, or Merged from appearing ready.
- Two consumers can observe different read stages briefly. Test convergence after realtime updates and preserve thread/request guards; do not claim atomic updates.
- The existing suppression CSS depends on host markup. Browser checks must include the real composer, not only a plugin fixture. Track failures under the separate cleanup.
- Existing long merge-action requirements contain safety rules. Carry their full text and scenarios in the delta so archive does not lose those protections.

## Migration Plan

1. Implement against the current GitHub Insight source and replace hidden-state tests with the new matrix. Do not migrate stored summaries or RPC payloads.
2. Run package tests, typecheck, build, and the required completion review. Update the README and plugin overview with the state and availability behavior.
3. Run browser acceptance at normal and compact widths, with paired panel/banner evidence in light and dark themes. Use fixtures for queue, error, and terminal states; do not modify real PRs to create them. Obtain separate approval before replacing an installed plugin or changing live records.
4. Record passed, failed, blocked, and skipped checks. Native desktop checks are optional unless explicitly requested; browser evidence does not prove native behavior.
5. If an approved installation needs rollback, restore the recorded previous plugin build. No stored-data rollback is needed. Do not change unrelated settings or plugins.
