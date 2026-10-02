# Design

## Context

See `proposal.md` for motivation and `specs/task-overview-work-status/spec.md` for acceptance behavior.

- `views/list/data.ts` currently calls `listTaskThreads` once per visible task and retains only starting/working attachments. `views/list/row.tsx` presents a constant-text Active chip before labels. `views/list/index.tsx` already supplies the displayed parent/subtask set to enrichment.
- `TaskThread` stores a cached execution status, not `archivedAt`. `lifecycle/index.ts` treats deleted threads as completed, never transitions completed attachments again, and reconciles nonterminal attachments every five minutes. Consequently a completed attachment is not proof of archive state or a completed task.
- Task detail uses `listTaskPullRequests` to resolve attached threads' environments, deduplicate host PR lookups, and return basic lifecycle information plus unavailable thread IDs. The list does not consume it. Keep this existing detail/CLI contract working.
- GitHub Insight writes version 1 `prSummary` metadata containing lifecycle, check/review counts, blocker codes, a refresh timestamp, and an error. Its refresh scans exclude archived threads. The sidebar consumer demonstrates metadata access and one-hour open/draft freshness, but its list excludes archived threads and its parser drops unknown blockers. Do not reuse either behavior unchanged for Tasks.
- `pr-merge-queue-status` plans an additive `mergeQueue` field. Its publisher can omit ordinary blockers while a PR is queued, so an empty blocker array alone must not make that PR ready.
- Existing list tests protect label bounds, absence of comment/attachment lookups, optimistic editing, nested rows, keyboard navigation, and mobile metadata wrapping. Preserve these behaviors except the explicitly replaced Active-chip presentation.

## Goals / Non-Goals

**Goals:**
- Put metadata validation, freshness, deduplication, and precedence behind a small enrichment interface rather than teaching each row about SDK or GitHub response shapes.
- Keep attachment identities and detailed statuses available while letting row presentation bound visible text.
- Improve accuracy through read-only authoritative hydration without changing durable task or attachment lifecycle data.

**Non-Goals:**
- No dependency on Threads with PRs being installed and no imports from sibling plugin source files.
- No new global GitHub polling system or refreshing archived PRs through GitHub Insight.
- No lifecycle rewrite, task database migration, task-status automation, status-based filtering/sorting, board changes, or merge/review controls.

## Decisions

### One batch enrichment module behind the Tasks RPC seam

Add `listTaskWorkStatus({ taskIds })` to the Tasks contract, with a maximum of 500 unique task IDs per request. Return entries keyed by task ID containing hydrated attachment records, distinct PR records, and explicit availability/detail-quality information. Retain individual records so drill-down does not need another lookup.

The module accepts the store, required BB SDK methods, and a clock. Internally it:

1. Reads the attachments for requested tasks without comments or attachments/media enrichment.
2. Deduplicates thread IDs globally for that request and reads current SDK thread information with concurrency capped at eight.
3. Reads GitHub Insight metadata for those thread IDs through `getPluginMetadata({ pluginId: "github-insight" })`, including archived attachments rather than scanning all threads in the project.
4. Groups host PR lookups by unique environment when a current lifecycle check or missing/invalid rich metadata requires fallback. Deduplicate in-flight lookups across chunks during a list refresh; do not issue `gh` or GraphQL calls from each row.
5. Joins normalized records back to all requested tasks. A failing read becomes an item-level unavailable result, not a rejected entire batch.

Check optional plugin availability once per refresh. A plugin-list failure is itself uncertainty, not proof of absence. Response schemas contain normalized data, not arbitrary plugin metadata. Existing per-task thread and PR RPCs remain compatible.

Alternative rejected: add `listTaskPullRequests` to the existing per-row request fan-out. It duplicates environment reads across tasks, increases list latency, and leaves rows responsible for multiple overlapping status contracts. A shared cross-plugin package is also unnecessary for this change; keep the adapter local and protect it with producer-shaped fixtures.

### Archive state is orthogonal to current execution

Hydrate runtime status from current SDK thread state, and `archivedAt`/`deletedAt` from their actual fields. Starting includes pending/starting; working includes active/stopping; idle and error map to Idle and Failed. Deleted or explicitly not-found threads are Removed. Other lookup failures are unavailable, never silently removed or archived.

The new response does not add fields to durable `TaskThread` or change existing `liveStatus` semantics. Cached status may provide historical context in drill-down but cannot override an authoritative current state.

Thread bucket counts cover all existing readable attachments, including archived ones. Archive counts overlap runtime counts and are labelled accordingly. Show All threads archived only when every existing attachment is verified archived and no attachment has unknown existence/archive state. Removed attachments are identified separately and do not masquerade as archived. A task with only removed attachments shows Removed, not All threads archived.

Alternative rejected: add `archived` to the execution enum. A thread can be both archived and failed, and unarchiving must not invent a runtime transition.

### Preserve identity and uncertainty before choosing a status word

Validate version 1 metadata and distinguish metadata refresh time from host PR `updatedAt`. Rich open/draft information older than one hour is stale; valid terminal summaries are reusable at any age. Invalid timestamps, unsupported versions, invalid fields, refresh errors, unknown blocker codes, or uninterpretable queue fields cannot establish readiness. Nonempty queue information suppresses Ready, with a conservative queued label when recognizable and Details unavailable otherwise.

Use known check/review counts as well as blocker codes to avoid claiming Ready for contradictory metadata. Derive lifecycle and rich-details quality separately, so a host-known Open PR can display Details unavailable or Details stale. The absence of a metadata summary is not evidence of no PR.

Within each task, deduplicate PRs by canonical GitHub URL, not number alone. For duplicate summaries choose the newest valid observation of the same PR. Preserve known identity and links when details cannot be used. A newer host lifecycle observation supersedes conflicting older metadata; rich details apply only to the same PR URL and compatible current lifecycle. An authoritative absent result supersedes metadata for a former environment association. Without a decisive observation, label conflicting information unavailable instead of guessing. Retain all attached thread references for each distinct PR.

Alternative rejected: import the sidebar parser unchanged. It discards stale data without a reason and drops unknown blockers, which can create a false Ready state. A Tasks adapter must keep quality information and handle archived threads.

### Aggregate by counts and primary condition without hiding detail

Thread summary priority is Failed, unavailable, Starting/Working, Idle, Removed. Display at most two runtime buckets plus a counted overflow affordance, and retain the archive count or All threads archived text. A failed bucket is never collapsed behind Working. Each drill-down entry shows runtime, archive state, and a thread link if available.

For a single PR, show `PR #42 · Checks failing`, for example, with its direct link and a separate details control if needed. Multiple PRs show a total and counts by primary condition, such as `3 PRs · 1 failing · 1 awaiting review · 1 merged`. One PR contributes once to the aggregate total and one primary bucket; all simultaneous conditions remain in drill-down.

For fresh open PRs, primary-condition order is Conflicts, Checks failing, Changes requested, other blocking/queue failures, Checks running, Awaiting review, Unresolved comments, Behind, Ready. Draft/Merged/Closed lifecycle controls the principal lifecycle label; draft check failures remain a visible problem cue. Unavailable or stale details are never counted as Ready. Mixed known/unknown aggregates expose incompleteness. Terminal states ignore obsolete check blockers.

Less urgent buckets can collapse into a counted More control, but the highest known problem stays textual on the row. Expand the drill-down to inspect every PR, its lifecycle, details quality, all blockers, and associated threads.

Alternative rejected: select the latest thread or the latest PR. That hides concurrent work and contradicts the user's requested summary.

### Fit the existing metadata rail without sacrificing interaction

Keep task status/key/title on the left. Place thread and PR summaries after dependency/subtask metadata and before labels/due date/project metadata. Replace Active rather than stacking a duplicate badge.

Wide rows stay compact. At intermediate widths, use bounded summaries and reduce visible label chips before truncating task titles to nothing. If the full metadata rail cannot fit, move it beneath the title rather than enforcing the existing fixed 34px height. Narrow rows wrap metadata using the existing container-query layout. Keep archive and problem cues accessible in both layouts. Use text, icons, tabular counts, and host state tokens; do not dim an entire task merely because its threads are archived.

Use existing Popover primitives and compact bottom-drawer conventions for drill-down. Summary controls sit above the absolute row-open button, are not nested in it, and prevent accidental task navigation. Give each control a task-specific accessible name, support Escape/focus return, and suspend row-level single-key navigation while its overlay is open. A single PR link opens GitHub; a multiple-PR summary opens the list of PR links. Thread links navigate through BB. No archive or PR mutation controls are added.

Alternative rejected: icons plus hover tooltips only. They do not explain mixed states and are unusable for touch-only discovery.

### Refresh visible rows, not the entire project

Change `useTaskListMeta` to use the batch interface for its supplied visible task IDs, chunking sets over 500. Reuse Tasks invalidation and manual refresh, add a 60-second fallback while the list is mounted, and refresh after reconnect. Coalesce overlapping requests and discard late results for previous list scopes. Age retained results against the current clock so a failed refresh cannot keep a stale Ready label alive.

No new global broadcaster is required. Optional producer notification support must not become a correctness dependency: the current sidebar BroadcastChannel is not sufficient evidence that every producer write reaches Tasks. The fallback reads current thread/archive fields and metadata even when no Tasks lifecycle event fires. Stop timers on unmount. Preserve successful item results alongside unavailable items and never delay basic task row rendering behind metadata hydration.

Alternative rejected: rely only on `threads:changed`. Archive changes and PR metadata writes do not necessarily produce that Tasks-owned event.

## Risks / Trade-offs

- [Wide metadata rows crowd out task titles] -> Verify a dense row preview early at wide, intermediate, and narrow widths; allow the metadata rail to wrap rather than adding unlimited inline badges.
- [Archived open PR details become stale because GitHub Insight excludes those threads] -> Label stale details and use host lifecycle fallback where available. Extending archived GitHub polling is a separate change.
- [Metadata evolves with merge queue support] -> Test additive queue fields, unknown blockers, producer errors, and invalid timestamps; conservatively suppress readiness. Do not block this change on shipping queue actions.
- [SDK reads scale with attachments] -> Batch visible rows, deduplicate threads/environments, cap concurrency, coalesce refreshes, and test lookup counts. No per-row GitHub detail fetches.
- [Stored attachment status says completed while a current thread is idle] -> Prefer hydrated SDK state for the overview without changing the existing attachment lifecycle or CLI contract.
- [Optional metadata access fails] -> Keep thread status and available host PR information, visibly mark missing detail, and avoid rejecting unrelated rows.

## Migration Plan

1. Add the read-only batch contract and implementation without changing existing persisted task data or RPC outputs.
2. Switch only list metadata loading and rendering to the new interface, preserving detail pages and existing active-work selection semantics.
3. Verify standalone Tasks Plus installation as well as installation with GitHub Insight, including archived threads and stale summaries. Document rich-status availability in the Tasks README.
4. Roll back by restoring the old Active-chip list rendering and loader. No data rollback is necessary because enrichment never mutates stored attachments, tasks, or external PRs.
