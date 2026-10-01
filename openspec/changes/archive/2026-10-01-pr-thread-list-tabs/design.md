# Design

## Context

See proposal.md (Why). Current state:

- `app.tsx` windows the rows (`items.slice(start, end)`). Each mounted row calls `experimental_useSidebarThreadPullRequest` and polls `getPluginMetadata` for the github-insight `prSummary`.
- github-insight's `pr-poller` lists every non-archived thread, resolves its PR on the server, and writes `prSummary` (version 1) to thread metadata. It writes on change, and at least each 30 minutes for open PRs (`SUMMARY_HEARTBEAT_MS`). It removes the summary when a thread has no PR.
- Merged and closed PRs are settled. The poller does not refresh them, so their `updatedAt` grows old. `readInsight` drops a summary older than one hour.
- `server.ts` of the list is empty. `list-model.ts` puts "Needs you" threads in an `attention` group.

## Goals / Non-Goals

**Goals:**

- One pure function decides the tab of a thread from the thread and its summary.
- One request each minute gets the summaries for all active threads.
- The badge and the tab read the same summary, so they cannot disagree.

**Non-Goals:**

- No live push from github-insight. A one-minute delay is accepted.
- No change to the github-insight summary format.

## Decisions

### D1. The list's own server reads all summaries

The list server registers one RPC, `listSummaries`. It lists the active threads, reads the `github-insight` plugin metadata of each, and returns `{ threadId: prSummary }`. The app calls it once on load and then each 60 seconds, plus when the realtime connection comes back.

```
 github-insight pr-poller --write prSummary--> thread metadata
                                                    ^
 list server: listSummaries --read each active------+
      ^
      | every 60s
 list app --> summaries map --> tabFor(thread, summary) --> tabs
                            \-> presentPullRequest(summary) --> badge
```

Alternatives:

- github-insight adds a `listSummaries` RPC: BB documents no way for one plugin's app to call another plugin's RPC. Rejected for now.
- Keep the per-row poll: cannot see rows off screen, so tabs are wrong. Rejected.
- Mount hidden PR hooks for all threads: one BB lookup per thread. Rejected.

The server reads metadata locally. It makes no GitHub call. With N active threads, it does N metadata reads each minute.

### D2. Summary replaces BB's PR facts in the badge

`presentPullRequest` today takes BB's `PluginSidebarPullRequest` plus an optional insight. It changes to take the summary only:

| Badge input | From summary |
|---|---|
| state (open, draft, merged, closed) | `pr.state` |
| number, URL | `pr.number`, `pr.url` |
| checks lead colour | `checks.failed > 0` failed, `checks.running > 0` running, `checks.passed > 0` passed, else unknown |
| marks and word | `blockers`, with the counts from `checks` and `reviewers` |
| ready | open, and `blockers` is empty |

`blocked` shows only when no other blocker code applies, as github-insight already guarantees. The rule from today that the summary may not contradict BB goes away, because BB's facts are no longer used.

### D3. Summary age

An open or draft summary older than one hour is not usable (the heartbeat is 30 minutes, so a live poller always stays inside the limit). A merged or closed summary has no age limit, because its state is final and the poller does not refresh it. A summary with `version !== 1` is not usable.

### D4. One pure tab function

`tabFor(thread, summary | null): "attention" | "inflight"` in a new `tabs.ts`, first match wins:

```
 needsAttention(thread)                       --> attention
 thread.isUnread                              --> attention
 isBusy || activity > 0 || queued waiting     --> inflight
 no usable summary                            --> attention
 blockers has conflicts | checks_failed |
   changes_requested | unresolved_threads     --> attention
 blockers has checks_running | review_required
   or checks.running > 0                      --> inflight
 otherwise                                    --> attention
```

`behind`, `draft`, and `blocked` alone lead to attention. Each needs an action from the user.

### D5. Tabs filter before grouping

`visibleItems` gets the selected tab and the summaries map. For Needs attention and In flight, it keeps only active, non-hidden threads with that tab, and skips the `attention` group, so pinned and normal grouping apply. For All, it keeps today's behaviour, including the "Needs you" group and the lifecycle filter. Parent nesting already falls back to a top-level row when the parent is not in the same bucket. This covers a parent in the other tab.

The sidebar hook still loads threads with `prefs.lifecycles`. In Needs attention and In flight, the app asks for `["active"]` so archived rows are not fetched.

### D6. Preferences

`ListOptions` gets `tab: "attention" | "inflight" | "all"`, default `"attention"`. The storage key and version stay at v1. `readPreferences` reads a missing or invalid tab as the default. This is additive, so a v1 value from today still loads.

### D7. Top bar

The segmented control keeps its look and place. Its three options become the tabs (`role="tablist"`). The Active / Archived / Both choice moves into the List options menu as a radio group, shown only when All is selected.

### D8. github-insight presence

The server reports `insightAvailable` with the summaries. It is false when the github-insight plugin is not installed or not enabled. When false, the app shows a one-line notice above the rows.

SDK calls (checked in SDK 0.5.29):

- Summary: `bb.sdk.threads.getPluginMetadata({ threadId, pluginId: "github-insight" })`.
- Threads: `bb.sdk.threads.list({ archived: false })`.
- Presence: `bb.sdk.plugins.list()`. Available when the `github-insight` entry is `enabled` and its `status` is `running`, `starting`, or `degraded`. If the call fails, the server reports `insightAvailable: true` and still reads the summaries.

## Risks / Trade-offs

- [The summary lags GitHub by up to two minutes (poller, then list poll)] -> Accepted. Thread signals, which are live, decide first.
- [N metadata reads each minute with many threads] -> Reads are local. Run them with a small parallel limit. Cache nothing on the server, so no state goes stale.
- [Users without `gh` lose the basic BB badge] -> Accepted by the user. The README says that github-insight and `gh` are required.
- [A rate-limited poller stops writing, and open summaries pass one hour] -> Those rows show no badge and go to Needs attention. This is safe: no false "In flight".
- [The server has no API for plugin presence] -> Fall back to `insightAvailable: true` and no notice, and record that in the README. The tab rules do not change.

## Migration Plan

1. Ship the list with the RPC, tabs, and summary-only badge in one release.
2. Saved preferences load without migration (D6).
3. Rollback: install the previous version. The saved `tab` field is ignored by the old reader.
