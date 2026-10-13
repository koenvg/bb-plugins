# Tasks

## 1. Queue: per-id conversation activity

- [x] 1.1 Add `id` to `comments` and `reviews` nodes in the `QueueActivity` fragment (`github/review-queue-query.ts`) and verify `github/review-queue-query.test.ts` asserts the new fields
- [x] 1.2 Replace `lastConversationAt` with `conversationComments: PostedComment[]` in `PrActivity` (`core/review-queue.ts`): PR comments by `createdAt`, reviews with text by `submittedAt`, others only. Verify `core/review-queue.test.ts` covers comment, review with text, approval with no text, bot, and own comment
- [x] 1.3 Make `newActivitySince` (`queue/review-queue-service.ts`) run `newCommentIds` on conversation and inline comments together, and bump the stored queue schema to `v: 4`. Verify `queue/review-queue-service.test.ts` covers "User saw the conversation comment", "User saw a review text", "Conversation comment keeps the label", and "User saw the review text but not its inline comments"
- [x] 1.4 Update the "Reviewed state" section of `README.md` (the "A PR comment or review text still counts" line) and verify it matches the `pr-review-requests` delta spec

## 2. Timeline: new comment ids from `getTimeline`

- [x] 2.1 Add `viewer { login }` and `__typename` on authors to the timeline query (`github/timeline-query.ts`) and parse them in `core/timeline.ts`. Verify `core/timeline.test.ts` and `github/timeline-query.test.ts` pass with the new fields
- [x] 2.2 Add `newCommentIds` to `timelineResultSchema` (`contract.ts`). Give `createTimelineService` a `newCommentBasis` dep in `server.ts`, and compute the ids from the page with `isOtherPerson` and `newCommentIds`. Verify `timeline/timeline-service.test.ts` covers: PR comment after the mark, review with text, approval with no text, bot, own comment, no mark, and a seen id
- [x] 2.3 Keep the union of `newCommentIds` from every loaded page in `useTimeline` (`ui/timeline.tsx`) and verify a `ui/timeline.test.tsx` case where "Load older events" adds an id

## 3. Overview: glow and seen tracking

- [x] 3.1 Make a ref for the Overview scroll div in `ui/pr-panel.tsx` and pass it through `OverviewTab` to `TimelineSections`. Verify typecheck passes (`bun run typecheck`)
- [x] 3.2 Give `ConversationTimeline` a `NewCommentGlowContext` from `useNewCommentGlowState`. Make the comment card and the review card with text call `useNewComment`, set the ref, add `review-comment-new`, and be `relative`. Verify `ui/timeline.test.tsx` covers: only the new card glows, glow stays after a refresh, a card seen after 1.5 s calls `markCommentsSeen` with its id, and a scroll-out before 1.5 s does not
- [ ] 3.3 Verify in `ui/pr-panel.test.tsx` that a new card in the Overview tab is not seen when the user selects the Files sub-tab before 1.5 s
- [x] 3.4 Update the "New comments in the Files sub-tab" section of `README.md` to cover the Overview Conversation timeline (rename the heading, add the review id as seen key) and verify it matches the `pr-review-new-comments` delta spec

## 4. Integration

- [x] 4.1 Run `bun run test`, `bun run typecheck`, `bun run lint`, and `bun run format:check` in `bb-plugin-github-insight` and verify all pass
- [x] 4.2 Build and load the plugin, mark a PR reviewed, have another person post a PR comment, open the Overview tab, and verify the card glows, the "New comments" label leaves the review queue after the card is seen, and the card has no glow after a bb reload
- [x] 4.3 Run `openspec validate mark-conversation-comments-seen --strict` and verify it passes
