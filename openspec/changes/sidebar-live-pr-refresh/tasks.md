# Tasks

## 1. Refresh on idle (github-insight)

- [x] 1.1 Add `refreshOnIdle(threadId)` to the insight service, as design.md decision 1 describes. Verify with new cases in `server.test.ts` (fake timers):
  - An idle thread with an open PR gets one GitHub fetch and a new `prSummary`.
  - An idle event during a poll for the same PR joins that poll and causes no second fetch.
  - With `no_pr`, it resolves again after 10s. When the second try finds a PR, it fetches. When the second try finds no PR, it stops.
  - A paused service makes no request.
  - A settled PR makes no request.
  - A resolution error logs a warning and does not throw.
- [x] 1.2 In `server.ts`, register `bb.events.on("thread.idle", ...)`. It calls `refreshOnIdle` without waiting and logs errors. Clear the retry timers when the plugin unloads. Verify with a `server.test.ts` case where a `thread.idle` event writes the `prSummary` of that thread, and a case where an unload during the 10s wait causes no later call.
- [x] 1.3 Update the refresh section of `bb-plugin-github-insight/README.md` to say that a PR refreshes when its thread goes idle. Verify that the README text matches the behavior.

## 2. Summary watch (pr-thread-list server)

- [x] 2.1 Add the `summaries.changed` channel constant to `contract.ts`. Add a fingerprint function next to `listSummaries` in `summaries.ts`: the same summaries in a different key order give the same value. Verify with new cases in `summaries.test.ts`.
- [x] 2.2 Add the `summary-watch` background service in `server.ts`, as design.md decision 2 describes. Verify with new server tests (fake timers):
  - The first read publishes nothing.
  - A changed summary, an added summary, a removed summary, and a change of `insightAvailable` each publish once.
  - A read with the same content publishes nothing.
  - A failed read publishes nothing and the next tick still runs.
  - An abort stops the loop, also while it sleeps.

## 3. Reload on the signal (pr-thread-list app)

- [x] 3.1 In `use-summaries.ts`, call `load` on `useRealtime(SUMMARIES_CHANGED_CHANNEL, ...)`. Keep the timer, the reconnect reload, the BroadcastChannel, and the newest-load guard. Verify with `app.test.tsx` cases:
  - A realtime signal loads the summaries again and the row shows the new badge and tab.
  - A load that started before the signal and ends after it does not overwrite the new summaries.
- [x] 3.2 Update `bb-plugin-pr-thread-list/README.md` where it describes the refresh. Verify that the text names the realtime signal and the 60s fallback.

## 4. End-to-end check

- [x] 4.1 In the running app, ask an agent in a thread to push a commit to its open PR. When the turn ends, verify that the row shows checks running and moves to In flight within about 15s. Then ask an agent to open a new PR, and verify that the badge shows within about 15s. Run `npm test` in both plugins and verify that they pass.
