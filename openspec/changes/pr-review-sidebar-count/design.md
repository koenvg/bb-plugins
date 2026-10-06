# Design

## Context

- `app.tsx` registers the Pull Requests navPanel without `experimental_sidebarAccessory`. Tasks Plus (`shell/sidebar-accessory.tsx`) and Codex Quota already use that slot.
- `useReviewQueue()` reads the stored queue over RPC and follows `REVIEW_QUEUE_UPDATED_CHANNEL`. The background service publishes on every refresh and re-link.
- `createReviewQueueService` builds `ReviewQueueView` in `linkView`. It already reads plugin KV there for reviewed marks (`queue/reviewed-marks.ts`).
- `relink()` rebuilds the stored view from stored rows and publishes it, without a GitHub call. Today only plugin actions and the 5-minute refresh call it, so thread status on cards can be up to 5 minutes old.
- `server.ts` listens to `thread.idle`, but only for the PR tab (`service.refreshOnIdle`).
- `threadStatus()` maps `hasPendingInteraction` to `needs_you`. The SDK gives plugins no per-thread unread state.
- `ComposerBanner` mounts for every opened thread with `scope.threadId`.

## Goals / Non-Goals

**Goals:**
- Sidebar and card state come from the server-side view, so every window agrees.
- No extra GitHub calls.
- The dot appears within seconds of an agent stopping.

**Non-Goals:**
- A "new" mark on individual PR cards.
- Desktop notifications or sounds.
- Tracking new commits as "new".
- Returned state for threads the plugin did not start.

## Decisions

### Unseen PRs live on the view

`linkView` reads a seen-key set from KV (`review-seen`) and adds `hasUnseen: boolean` to `ReviewQueueView`. It is true when a `needsReview` PR key (`prKey(repo, number)`) is not in the set.

- Alternative: send the seen set to the client and compute there. Rejected: two sources of truth, and the badge needs the set before the panel ever opened.

New fields parse as `false` when missing, so views stored by an older version need no migration.

### Client sends the PR keys it shows

New RPC `markQueueSeen({ prs })` replaces the seen set with those PRs, then calls `relink()`. The panel sends the `needsReview` PRs it renders. A PR the panel has not rendered yet stays unseen until the realtime update reaches the panel and it sends again.

Each build also removes seen keys that are no longer in `needsReview` (see "Cleanup after the build"). Without this, a PR that left while nothing was unseen would stay in the set, because the panel only writes when `hasUnseen` is true.

`ReviewQueueLists` runs an effect: when the loaded view has `hasUnseen: true`, it calls `markQueueSeen`. It makes no call when `hasUnseen` is false, so an open panel does not write KV on every refresh.

### Returned threads: event in, open out

One KV key per returned review thread (`review-returned:<threadId>`). Per-thread keys keep an add from one event and a prune in a parallel re-link from overwriting each other.

| Trigger | Effect |
|---|---|
| `thread.idle` for a thread the plugin started | add id, `relink()` |
| `thread.failed` for a thread the plugin started | add id, `relink()` |
| `markThreadOpened({ threadId })` | remove id, `relink()` |
| cleanup after the build | drop ids that `listReviewThreads` no longer returns unarchived |

`LinkedThread` gets `returned: "finished" | "failed" | "needs_you" | null`, only for review threads:

| Status | Stored key | `returned` |
|---|---|---|
| `needs_you` | any | `needs_you` |
| `idle` | yes | `finished` |
| `error` | yes | `failed` |
| `running`, or no key | | `null` |

One variant per reason keeps consumers simple: the card label is a full `Record<ReturnedReason, Label>`, and the banner checks `finished` or `failed`. A thread whose agent runs again (retry, automation) is not returned while it runs. `ReviewQueueView` gets `hasReturned: boolean` across both sections.

### Cleanup after the build

`linkView` stays free of writes. It returns the view plus the stale state: returned ids of threads that are no longer live, and seen keys no longer in `needsReview`. `load()` and `relinkOnce()` delete those after the build. Liveness comes from `listReviewThreads`, not from the metadata read, so a failed metadata read does not drop a returned thread.

- Alternative: compare thread `updatedAt` with a stored "opened at". Rejected: `updatedAt` may change for reasons other than the agent stopping, and opening a thread may or may not touch it.
- Alternative: detect running to idle only by diffing stored views. Rejected: a follow-up run that starts and stops between two re-links would be missed. The event catches it.

`thread.idle` and `thread.failed` now also update the review queue, so cards and the dot update without waiting for the GitHub refresh. They read bb state only.

### Thread opens come from the composer banner

`ThreadBanner` calls `markThreadOpened(threadId)` on mount. The server returns at once, without a write or a re-link, when the thread is not stored as returned. So opening an ordinary thread costs one cheap RPC.

While mounted, the banner follows `REVIEW_QUEUE_UPDATED_CHANNEL`. When an update shows its thread as returned and not `needs_you` (the agent stopped while the user watched), it calls again. The dot may flash for one round trip. That is accepted, and it avoids tracking which threads are open.

- Alternative: the banner loads the queue and calls only for returned threads. Rejected: every thread open would read the queue, for a check the server can do itself.

The card's "Open thread" action needs no extra call: it opens the thread, which mounts the banner.

`needs_you` is not cleared by opening. It stays returned until bb clears `hasPendingInteraction`.

### Card status

The card's existing thread status gets an accent variant when `thread.returned` is set: "Agent finished", "Needs you", "Failed". `needsYou()` in the sort also counts `thread.returned`, so the existing "attention first" order covers returned threads.

### Sidebar badge component

New `ui/pr-sidebar-badge.tsx`, registered as `experimental_sidebarAccessory`. It uses `useReviewQueue()` and a pure helper `core/review-badge.ts` that maps the view to `{ count: string | null, unseen, returned }`.

```
Pull Requests   11          muted count, nothing new
Pull Requests  (11)         pill: new PR in Needs review
Pull Requests   11  *       dot: a review agent came back
Pull Requests       *       nothing to review, agent came back
```

| Part | Style |
|---|---|
| Muted count | `text-muted-foreground tabular-nums`, same as Tasks |
| Unseen pill | `bg-primary text-primary-foreground tabular-nums`, rounded, with sr-only ", new" |
| Returned dot | small round `bg-primary` dot with `aria-label` "Review agent came back" |

A filled pill and dot, not only a text color, because the default theme's `primary` is neutral graphite. Text color alone would not read as "new" there.

## Risks / Trade-offs

- [No SDK event for a pending question] → `needs_you` shows on the next re-link (any thread event, plugin action, or the 5-minute refresh).
- [Opening a thread outside bb's composer (if possible) does not clear it] → The banner mounts for every thread view in bb today. Card "Open thread" goes through the same path.
- [Two windows race on `markQueueSeen`] → Both send the keys of the same stored view. Last write wins with the same keys.
- [The seen-set prune and `markQueueSeen` both write the whole set] → The prune reads the set again right before it writes. A lost key only makes one PR show as new once more.
- [Two review threads on one PR] → The card links only the newest thread. A returned older thread shows no dot until the newer one is archived. Rare, accepted.
- [`experimental_sidebarAccessory` is experimental] → Tasks Plus and Codex Quota already depend on it. If it goes away, only the badge disappears.
- [Thread events fire for every thread] → The service ignores threads the plugin did not start before it writes KV or re-links.

