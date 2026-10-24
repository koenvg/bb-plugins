# Design

## Context

See `proposal.md` for motivation and the two delta specs for acceptance behavior. This design is required because rendering, query lifetime, a cross-plugin DOM integration, and editable task transitions share the browser thread.

Observed during exploration:

- The installed Tasks bundle was `70cac470a8d1d290`, built from `/Users/koen/.bb/local-plugins/tasks-plus-native-a5c397775cb4`. Its native Ticket source exists on `bb/bbp-8-remembered-project-and-editable-ticket-spl-thr_v9ni4kqgxa`. This planning checkout still has standalone list/detail outlets. Do not optimize that older composition and claim it fixes the deployed native pane.
- The native workspace keeps one portal container and one Tasks session across host Ticket tab changes. The accepted route owns selection; the session owns pending writes and task-specific comment drafts. `validatedKey` adds an effect-driven readiness pass before mounting the selected detail.
- Each selected key mounts a keyed detail query with no task-preview snapshot. After lookup, the detail mounts independent project, parent, subtask, label, attachment, thread, preset, and PR queries. Activity adds a comments read and an attachment read per non-system comment. The dependency sections fetch every tracker task before either picker opens.
- `TasksEditor` creates a Tiptap editor in an effect. Its instances include the description, composer, and each rendered non-system comment. Keyed detail replacement destroys them. These keys protect task ownership; removing them is not a safe optimization.
- List rows are not memoized. `formatDueDate` calls `toLocaleDateString` with options on each render. In four instrumented arrow movements with 78 displayed rows, there were 1,458 date calls per movement, taking 52–68 ms. This indicates repeated work, not that every call came from one row render.
- The installed quota bundle was `acd64ffbb1fabefc`. Its `footer-adapter.ts` matches this checkout. Its document-wide MutationObserver reconciles nearly every relevant-attribute mutation on the page. Reconciliation checks computed visibility up the native button's ancestor chain. Those checks were a major CPU-profile hotspot.
- Six profiled movements took 367–482 ms from key event to matching description-editor DOM. Four later instrumented, unprofiled movements took 326–383 ms. Main-thread tasks exceeded 100 ms. These are preliminary headless measurements, not the final presentation-frame benchmark.
- Two attempted quota-isolation experiments did not suppress the running integration. They provide no valid enabled-versus-disabled comparison. A timeline trace also showed substantial style and layout work, but its nested event durations must not be added as independent costs.

## Goals / Non-Goals

**Goals:**

- Reduce work before a correct preview can be presented, with module-level work-count tests and paired browser evidence.
- Put preview retention and request identity behind one small task-preview module interface, rather than exposing cache policy in every detail hook.
- Keep selection, writes, host placement, drafts, and live thread/PR status in their existing owners.

**Non-Goals:**

- No React replacement, new state-management library, database migration, generic cache framework, custom pane layout, or full-tracker prefetch.
- No permanent cache of editable editor instances. No browser-reload or cross-device draft persistence.
- No new Markdown parser or implementation of the separate `markdown-reader` change. No caching of current thread/PR lifecycle claims as authoritative status.
- No automatic installed-source replacement or edits to the deployed local snapshot or another thread's worktree.

## Decisions

### 1. Use the native Ticket source as the implementation base

Identify the repository commit that owns the current native Ticket composition, then integrate that prerequisite into the implementation branch through the normal repository workflow. Compare the source with the installed snapshot before accepting benchmark evidence. If the repository prerequisite cannot be identified, stop the Tasks implementation rather than copying a deployed bundle or silently redesigning the workspace.

Keep the native portal, session, route replacement, and focus modules intact. The `tasks-split-view` planning design still describes an internal responsive split, while its newer executable source uses a host-owned Ticket tab. This change targets the observed native composition and does not rewrite the older change's artifacts. Resolve their final documentation/spec alignment when integrating or archiving the changes.

Alternative rejected: patch this checkout's old full-page detail first. It lacks the navigation path the user reported and would make the acceptance result misleading.

### 2. Filter footer changes before visibility reads

Keep the existing footer adapter interface. Separate cheap discovery of sidebar attachment/removal from reconciliation of a known target. A mutation is relevant only when it changes an owned quota target, sidebar navigation/footer structure, an observed visibility ancestor, or adds/removes a subtree containing a sidebar or target. Unrelated task DOM changes return before a document rescan or computed style access.

Track current sidebars, target buttons, and relevant ancestors for their mounted lifetime. Observe the known sidebar subtrees and relevant ancestor attributes. Retain a cheap lifecycle discovery path for late mounts and replacements. Filter added/removed subtrees, not every descendant mutation in the rest of the page. If stylesheet or viewport changes can affect supported target visibility, handle their explicit lifecycle signals without restoring a full-page attribute observer or polling.

Coalesce relevant batches into one pending reconciliation. Ignore badge-owned updates, write accessibility tokens only when missing, and check disposal before running queued work. Preserve `aria-hidden` modal-menu behavior, readiness-gated suppression, fallback navigation, ambiguity checks, and native focus transfer. Do not use a cached visibility result after a relevant ancestor change.

Alternative rejected: merely debounce the existing document-wide scan. It would still force unrelated style/layout work and delay fallback correctness.

### 3. Make selection update only the rows that change

Reuse `Intl.DateTimeFormat` instances for the existing `en-US` month/day and month/day/year outputs. Preserve local date-only parsing, current-year behavior, and the optional reference-date argument. Do not cache a current-year decision forever across midnight or New Year.

Memoize the expensive row representation using ordinary shallow props. Stabilize task/metadata identities, action callbacks, label collections, and visible-order reports at their existing owner. A pure selection change should update the old and new selected row rather than recreate every row's menus and date output. A real task, metadata, label, expansion, or pending-write change must still update its row. Do not add a custom comparator that skips semantic changes.

Avoid rebuilding and reporting the same visible order solely because selection changed. Investigate the repeated render/report path with work counters and fix it at the owner, not with a second selected-index store. Do not virtualize the list in this change; that would alter DOM focus, expansion, and scroll behavior before simpler changes are measured.

Alternative rejected: cache date strings alone. It reduces formatter cost but leaves repeated full-row rendering and DOM/style work intact.

### 4. Retain task data, not task editors

Add one session-owned task-preview module. Its narrow interface provides subscription/read state for a normalized task key, a selected-key load, adjacent warming, invalidation, and disposal. Keep generations, in-flight sharing, eviction, and retry policy inside it. Do not retrofit all `useTasksQuery` callers into a general cache.

Initial limits are 32 retained preview entries and a 2 MiB aggregate serialized task-data budget; evict least-recently-used unselected entries until both are met. Oversized tasks may be read but are not retained. Active editable state stays in the existing session, not the preview cache. A lookup remains available when retention is full.

Only the previous and next keys from a successfully settled visible order are eligible for warming. Permit at most two speculative calls at once. A selected read starts independently of that speculative queue and shares an existing matching-key request instead of duplicating it. Replace queued speculation when scope/order changes; dispose requests' publication rights when the session ends. If the transport cannot cancel an issued request, let it finish without rescheduling unwanted work or publishing to a disposed subscriber.

Scope reuse to the current Tasks RPC binding/session. Every request carries key and invalidation generation. Task invalidation marks affected entries stale; if the event has no task identity, invalidate all task previews. Manual refresh and reconnect invalidate the generation. Results from an older generation cannot make entries current again. Do not retain negative or failed reads as a permanent answer. Authoritative absence crosses the existing save barrier before clearing selection.

Use available matching data immediately when mounting the keyed detail. Keep the keyed edit-session lifetime and the save barrier; do not swap description content inside another task's live editor. Background refresh must not overwrite a local draft or pending title/property edit. Successful writes can update the matching cache entry, while live invalidation remains authoritative.

Share project/label/preset inventory reads within the mounted session where detail currently repeats them. Invalidate those resources on their existing project channel; do not prefetch attachments, comments, threads, or PR status for adjacent tasks.

Alternative rejected: remove detail keys or retain 32 complete editor trees. The first risks draft attribution; the second retains heavy DOM, listeners, and editor state without a clear lifetime.

### 5. Remove redundant transition and host work without weakening safety

An accepted movement still passes through `session.request(commit)`. The committed route remains the selected identity. A key already present in a current settled visible order can satisfy detail readiness in the accepted render, rather than tearing down the preview for an extra validation-effect pass. Initial entry and unsettled/removal cases still wait for the list's authoritative validation contract.

Keep asynchronous focus keyed to the accepted task. Never defer the description of A under a header claiming B. Rapid movement can discard obsolete read publication, but must not debounce or hide ordinary accepted input to make the benchmark appear faster.

Avoid another `openFixedTab` call when the matching native Ticket outlet is already visible on the current surface. Explicit selection must still reveal a parked/closed Ticket tab. Use observed host outlet lifetime and visibility, not selection alone, to decide. Preserve reveal-before-save and failure recovery; a completed save or speculative read must not reopen a tab the user switched away from.

Alternative rejected: weaken or skip the save barrier. The measured delay also occurs with no pending edit, so removing write safety would solve the wrong problem.

### 6. Defer secondary data and activity editor work

The two dependency sections keep rendering their existing links from task data. Move candidate loading behind picker-open state and share one demand load between both pickers. Retain cross-project candidates and existing exclusion rules. Within one detail session, reuse successful candidates until task invalidation, with explicit loading and retryable error states. Closing or switching a task prevents an earlier picker result from populating another task's controls.

Add `getTaskActivity({ taskId })` as an additive RPC returning existing display-comment records paired with their attachment metadata. Reuse comment-author/provider enrichment rather than duplicate it. Add one task-scoped store read that joins attachments to that task's comments and groups by comment id, instead of making one frontend RPC per comment. Read metadata only, never attachment bytes. Preserve order, system-comment treatment, download URLs, removed-thread status, and notification-target logic. Existing `listComments`, `listAttachments`, CLI behavior, and storage schema remain unchanged.

Start the activity read independently of basic preview readiness. Preserve loaded/error state explicitly; an attachment error must not look like an attachment-free comment. Defer mounting the activity's rich-text editors until the activity section is visible or the user explicitly enters it. Give the deferred section a keyboard-reachable activation path and stable loading space. The comment-focus action activates the section and then focuses the task's composer. Once activated, scrolling and keyboard access expose the complete feed. Do not create a new read-only renderer or retain offscreen editors across task identities.

Alternative rejected: issue every per-comment request concurrently. That still makes work grow with comment count and retains the same frontend fan-out.

### 7. Validate presentation time and deterministic work separately

Add a bounded browser benchmark and fixtures during implementation. Use a dedicated local browser on the target BB host, with no CPU throttling and a fixed 1440×900 viewport. The standard fixture contains 100 tasks with stable statuses, due dates and labels; a ten-task navigation window has approximately 2 KiB Markdown descriptions with headings, lists and links. Include one separate heavy-activity task with 50 human/agent comments and representative attachments. The heavy feed's scrolled loading is measured separately from initial description presentation.

Benchmark both plugins enabled on the same host, browser, dataset, viewport, and source composition before and after each stage. Warm the ten-task window, then record at least 30 Up/Down movements including A-to-B-to-A returns. Start at the captured keydown event and end at the first presentation opportunity after matching heading and rendered description are available; use frame-aligned marks and a trace to check the result, not merely query completion. Verify the selected row and detail identity for every sample. Report median, p95, worst value, blank intervals, long tasks, rendering/style/layout costs, and frontend request counts. Do not sum nested timeline durations.

Record cold selections, cache eviction, invalidation, rapid repeats, long descriptions, heavy activity, compact native drawer, failure, and save-pending transitions separately. The 100 ms p95 target applies only to the defined warm, clean navigation fixture; other results remain visible in the report. Instrumentation with CPU sampling adds overhead, so profile hotspot attribution in a separate run from the final latency run.

Use deterministic local tests for stable rows, date semantics, cache budgets/generations, request sharing, speculative limits, unopened-picker reads, batch attachment ownership, no editor creation for deferred activity, and footer visibility-read counts. Keep wall-clock thresholds out of jsdom tests. Use a focused quota enabled/disabled browser comparison only if its running frontend state can be proven; the prior unsuccessful suppression is not evidence.

Alternative rejected: claim success from an isolated React render or passing fixtures. They do not establish the installed host's native tab, style/layout, transport, and other-plugin costs.

## Risks / Trade-offs

- [Implementation source is older than deployment] -> Gate Tasks changes on the native-Ticket repository prerequisite and record the actual source commit and bundle.
- [Cached data hides deletion or overwrites a draft] -> Use key/generation checks, explicit stale state, existing edit ownership, and authoritative safe clearing.
- [Prefetch increases backend contention] -> Limit it to two adjacent reads, deduplicate by key, and prioritize selected reads without waiting for the queue.
- [Row memoization hides live status changes] -> Stabilize inputs without ignoring meaningful props; retain metadata and pending-edit regression tests.
- [Footer filtering misses ancestor visibility or late mounts] -> Test lifecycle discovery, ancestor changes, compact drawer, modal menus, and disposal with queued work.
- [Deferred activity harms keyboard access or moves scroll unexpectedly] -> Provide explicit activation, preserve the section's position, and test comment focus and native pane scrolling.
- [One batched feed creates a large response] -> Preserve the existing comment set rather than adding content, send metadata only, and measure the 50-comment fixture; pagination is a separate change if needed.
- [The quota profile overstates its independent cost] -> Keep the finding separate from causal claims and measure paired installed changes before declaring the benefit.
- [A timing target is met only by hiding errors or delaying input] -> Validate every sample's task identity, include failures as failures, and record cache/save/cold classifications explicitly.

## Migration Plan

1. Integrate the native-Ticket source prerequisite in the implementation branch; preserve this planning change and existing behavior.
2. Establish the reproducible baseline and deterministic regression tests before optimizations.
3. Apply footer filtering and list work reduction, then measure each stage. Add preview retention and secondary loading in subsequent verified steps.
4. Run test, typecheck, lint, and build for both changed packages. Verify cache invalidation, save failures, drafts, native tab lifecycle, dependencies, and attachments in the installed host.
5. Before changing either installed source, record its original source and enabled state and obtain approval for the specific replacement. Do not remove competing Tasks plugins or import data as part of this performance work.
6. Publish paired results against the spec target and disclose blocked checks, outstanding regressions, and final installation state. Remove only owned benchmark data and close owned browser sessions.
7. Roll back by reverting the source changes and rebuilding/reloading the approved previous installation. The new activity read is additive and preview retention is session-only; no stored task data requires migration.
