# Tasks

## 1. Before you start

- [x] 1.1 Check the state of the active change `pr-review-threads`. Finish, archive, or rebase it so that no open task edits `ui/review-tab.tsx` in parallel. Verify with `openspec list` and record the outcome in this task line. Outcome: archived on main; branch rebased on `3c4c24e`.

## 2. Sub-tab shell and the removal of "Review"

- [x] 2.1 Change `ui/command-intents.ts`: rename the `review` key to `files`, and add `show-overview` and `show-files` to `pr`. Update the tests in `ui/command-intents.test.tsx`. Verify with `npm test -- command-intents`.
- [x] 2.2 Add the module-level sub-tab memory (selected sub-tab and "Files mounted" for each thread, default "Overview"). Verify with unit tests: default, write and read back, and two threads stay separate.
- [x] 2.3 Add `ui/pr-panel.tsx` (`PrPanel`): sub-tab bar, `OverviewBody` (current `PrTabContent` in its own padded scroll area), and `FilesBody` (current `ReviewTabContent`, mounted on first show, then `hidden`). `PrPanel` handles `pr: show-overview` and `pr: show-files`. Verify with `ui/pr-panel.test.tsx`: new tab starts on Overview, a click switches, no `getReview` call before the first Files show, the Files reply text stays after Overview and back, and the selection stays after an unmount and remount for the same thread.
- [x] 2.4 Make `FilesBody` consume the `files` intents in place of `review`. Export it with the props that `ReviewTab` has now. Move `ui/review-tab.test.tsx` to it with only import and render changes. Verify with `npm test -- review-tab`.
- [x] 2.5 Make "No pull request for this thread", "Loading pull request…", and the read error show in the same way in both sub-tabs. Verify with a `pr-panel` test for each state on the "Files" sub-tab.
- [x] 2.6 Change `app.tsx`: register only `"pr"`, with layout `"flush"` and `PrPanel`. Remove the `"review"` registration and the `ReviewTab` export. Update `app.test.tsx` to assert one panel action. Verify with `npm test -- app` and `npm run typecheck`.
- [x] 2.7 Make the status entry points open "Overview": the `receivePrPanel` callback in `ui/use-pr-panel-navigation.ts` and the banner click in `ui/composer-banner.tsx` post `pr: show-overview` after `openThreadPanel`. Verify with `ui/pr-panel-navigation.test.tsx` and `pr-panel-navigation.integration.test.tsx`: the badge opens Overview when the PR tab shows Files, and the panel has one PR tab.

## 3. Palette commands

- [x] 3.1 Change `ui/commands.ts`: remove `open-review-tab`. Add `open-pr-files` ("GitHub: Open PR files"), which opens `"pr"` and posts `pr: show-files`. `open-pr-tab` posts `pr: show-overview`. Verify with `ui/commands.test.tsx`: the command list and the order of open and post.
- [x] 3.2 Make `submit-review`, `next-comment`, and `previous-comment` open `"pr"`, post `pr: show-files`, then post the `files` intent. Verify with tests: run from a closed PR tab and from Overview. The Submit panel opens, the stepper jumps once, and each command runs one action after a remount.
- [x] 3.3 Verify that "GitHub: Merge PR" does not change the sub-tab: add a `merge-flow.test.tsx` case with "Files" selected through preparation, confirmation, and result.

## 4. Timeline data

- [x] 4.1 Record a timeline GraphQL response for an open PR with a comment, a review with body and inline comments, an approve with no body, 3 commits in a row, ready for review, closed, reopened, and merged events. Trim it and save it under `test/fixtures/`. Verify that it parses as JSON and holds those cases.
- [x] 4.2 Add `github/timeline-query.ts` (query and `gh api graphql` args with an optional `before` cursor). Verify with a test on the args, the same as `review-threads-query`.
- [x] 4.3 Add `core/timeline.ts`: zod schema, a `TimelineEvent` union, and grouping of consecutive commits. Verify with unit tests on the fixture: each event type, commit groups split by a comment, review comment ids, and the `hasPreviousPage` cursor.
- [x] 4.4 Add the RPC `getTimeline({ threadId, before })` to `contract.ts` and `server.ts`. Use the PR lookup of `getInsight`. It returns `no_pr`, `error`, or `ok` with events, cursor, `locked`, and `viewerCanUpdate`. Verify with `timeline/timeline-service.test.ts` cases for each result.
- [x] 4.5 Add the RPC `addPrComment({ threadId, body })` with the `addComment` mutation on the PR node id. It rejects an empty body. Verify with `github/comment-mutation.test.ts` (args) and `timeline/timeline-service.test.ts` (one post, a GitHub error as an error result, no post without a PR). The contract schema rejects an empty body.

## 5. Timeline UI

- [x] 5.1 Add `ui/timeline.tsx`: comment, review (verdict, Markdown body, "N inline comments"), commit group (expandable), and lifecycle events, oldest first, with login and relative time, plus "No conversation yet". Verify with rendered tests for each event type and the empty state.
- [x] 5.2 Load the timeline when "Overview" mounts and again when the insight `refreshedAt` changes. Show the timeline error with "Retry" without hiding the status. Add "Load older events" for a cursor. Verify with tests: a refresh reloads, a failed read keeps the status, and "Load older events" adds older events above.
- [x] 5.3 Add `ui/pr-comment-composer.tsx`: textarea and "Comment", disabled while empty or while a post runs, cleared on success, text kept on error, hidden with a locked note when `locked` and not `viewerCanUpdate`. After a post, reload the newest page. Verify with tests for each spec scenario, including a double click that sends one RPC.
- [x] 5.4 Add the review-to-Files jump: the `PrPanel` context `showFiles({ jumpTo })`, and a `FilesBody` jump request that turns on "Show resolved" when needed and jumps to the first matching thread. Verify with a test: click "3 inline comments" on Overview, then "Files" shows and the jump highlight is on the first thread of that review.

## 6. Names and docs

- [x] 6.1 Change the user-facing "Review tab" text to "Files tab of the PR panel" in `core/review-prompt.ts`, `review/review-cli.ts`, and `package.json` description. Verify with `npm test -- review-prompt` and a grep that finds no "Review tab" in non-test source.
- [x] 6.2 Update `README.md`, `PLUGIN_OVERVIEW.md`, and `bb-plugin-pr-thread-list/README.md`: tab structure, the timeline, the comment composer, the command table, and a note that saved "Review" tabs do not come back after the upgrade. Verify with a grep for "Review tab" and "Open Review tab" that finds only the upgrade note.

## 7. Integration

- [x] 7.1 Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run format:check` in `bb-plugin-github-insight` and `bb-plugin-pr-thread-list`. All pass.
- [x] 7.2 Build and load the plugin in bb (`npm run build`). In a thread with an open PR: open the PR tab, switch sub-tabs, post a comment, click "N inline comments", run each "GitHub:" command, and click the sidebar badge while on "Files". Result: confirmed by the user in bb.
