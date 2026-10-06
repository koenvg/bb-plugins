# Tasks

## 1. Unseen PRs on the server

- [x] 1.1 Add `hasUnseen` to `reviewQueueViewSchema` in `core/review-queue-view.ts`, defaulting to `false`. Verify a stored view without the field still parses.
- [x] 1.2 In `queue/review-queue-service.ts`, read the `review-seen` KV key in `linkView` and set `hasUnseen` when a `needsReview` PR key is not in it. Verify with new cases in `queue/review-queue-service.test.ts`: empty set with PRs gives `true`, full set gives `false`, new commits on a seen PR stay `false`.
- [x] 1.3 Add `markQueueSeen(keys)` to the service: replace the set, then `relink()`. Verify in `review-queue-service.test.ts` that the published view flips to `hasUnseen: false`, and that a PR dropped from the set and requested again gives `true`.
- [x] 1.4 Add the `markQueueSeen` RPC to `contract.ts` and wire it in `server.ts`. Verify with a case in `server.test.ts` that the call reaches the service and publishes on `REVIEW_QUEUE_UPDATED_CHANNEL`.

## 2. Returned threads on the server

- [x] 2.1 Add `returned` to the linked thread schema and `hasReturned` to the view, both defaulting to `false`. Verify old stored views still parse.
- [x] 2.2 Add per-thread `review-returned:<threadId>` KV keys to the service with `threadStopped(threadId)` (add when it is a review thread, then `relink()`) and `markThreadOpened(threadId)` (remove, then `relink()`). In `linkView`, set `returned` for review threads in the set or with `needs_you` and drop ids that are not an unarchived review thread. Verify in `review-queue-service.test.ts`: idle review thread returns, branch thread does not, open clears, follow-up idle returns again, `needs_you` stays returned after open, failed review thread returns.
- [x] 2.3 Update the sort helper so returned threads sort with `needs_you`. Verify with a "Review thread came back" ordering case in `review-queue-service.test.ts`.
- [x] 2.4 Add the `markThreadOpened` RPC to `contract.ts`. In `server.ts`, wire it and call `reviewQueue.threadStopped` from the existing `thread.idle` handler and a new `thread.failed` handler. Verify in `server.test.ts` that `thread.idle` on a review thread publishes a view with `hasReturned: true`.

## 3. Sidebar badge

- [x] 3.1 Add `core/review-badge.ts` mapping a `ReviewQueueView | null` to `{ count, unseen, returned }`. Verify with `core/review-badge.test.ts`: null view, 0, counts summed across groups, "Reviewed" excluded, truncated gives `50+`, returned from either section.
- [x] 3.2 Add `ui/pr-sidebar-badge.tsx` with the muted count, unseen pill, and returned dot from design.md, and register it as `experimental_sidebarAccessory` in `app.tsx`. Verify with `ui/pr-sidebar-badge.test.tsx`: no badge at 0, number shown, pill when unseen, dot when returned, dot without count, update after a realtime queue event, last good state kept on error.

## 4. Panel and thread UI

- [x] 4.1 In `ui/review-queue-list.tsx`, call `markQueueSeen` with the rendered `needsReview` keys when the loaded view has `hasUnseen: true`. Verify in `ui/pull-requests-panel.test.tsx`: opening calls it once with the shown keys, a realtime update with a new PR calls it again, `hasUnseen: false` makes no call.
- [x] 4.2 Show the accent thread status ("Agent finished", "Needs you", "Failed") on cards whose thread is `returned`. Verify in `ui/pull-requests-panel.test.tsx` for each status and the plain status when not returned.
- [x] 4.3 In `ui/composer-banner.tsx`, call `markThreadOpened` on mount and when a queue update shows the open thread as returned and not `needs_you`. The server ignores threads that are not returned. Verify in `app.test.tsx`: mount reports, a later returned update reports again, a `needs_you` update does not, and the service ignores a thread that was not returned.

## 5. Docs and integration

- [x] 5.1 Describe the sidebar badge, the dot, and returned-thread cards in `bb-plugin-github-insight/README.md` and `PLUGIN_OVERVIEW.md`. Verify the text matches the spec scenarios.
- [x] 5.2 Run the plugin test suite, typecheck, and lint. Load the plugin in bb and confirm: the count matches "Needs review", the pill shows after a new request and clears on panel open, the dot shows within seconds of a review agent finishing, the card shows "Agent finished", and opening the thread clears both in two windows.
