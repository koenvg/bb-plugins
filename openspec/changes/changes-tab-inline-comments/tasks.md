# Tasks

## 1. Spikes

- [x] 1.1 Find the lowest `@get-bb/plugin-sdk` version with `environments.status`, `diffFiles`, and `diffPatch`, and the bb version it needs; verify with a throwaway RPC on the dev machine's bb that `diffFiles({ target: "all" })` returns files for this worktree, and record the versions in design.md (Decision 7)
- [x] 1.2 Scaffold `bb-plugin-changes/` with `bb plugin new` (package name, `bb` manifest, `components/ui/`, vitest config, tsconfig); verify `npm ci`, `npm test`, `npm run typecheck`, and `bb plugin build` pass in the directory
- [x] 1.3 Spike the shared package (design Decision 6): create `review-ui/` with one component that imports `react`, `@pierre/diffs`, and a Hugeicons icon, import it from `bb-plugin-changes` with a relative path; verify `tsc`, `vitest`, `bb plugin build`, and a `git:` install of the pushed spike branch with `--subdirectory bb-plugin-changes`, and record pass or fail and the import rules in design.md
- [x] 1.4 In a throwaway tab, render one `FileDiff` with `enableGutterUtility` and `onGutterUtilityClick`; verify in the running app that "+" shows on hover for added, context, and deleted lines and the callback gets the side and line number, and record the exact prop names in design.md

## 2. Server: diff and send

- [x] 2.1 Implement `resolveEnvironment(threadId)` and the target mapping (`all`, `uncommitted`, `branch_committed` with `mergeBaseBranch` from `status`, `commit(sha)`); verify unit tests with a fake SDK: each target maps to the right `diffFiles` args, and "no environment" returns an error
- [x] 2.2 Implement RPC `getChanges({ threadId, target })` returning files, initial patches, totals, commits, and outcome; verify unit tests: available, `not_applicable` maps to "no git repository", `unavailable` keeps its message, and binary, `too_large`, and `on_demand` files keep their mode
- [x] 2.3 Implement RPC `getPatches({ threadId, target, paths })` with `diffPatch`; verify a unit test that only the requested paths are sent and the patches come back per path
- [x] 2.4 Implement RPC `sendFeedback({ threadId, text })` with `threads.send` mode `auto`; verify unit tests: `sent`, `queued`, empty text rejected by the schema, and a thrown error returned as `{ kind: "error", message }`

## 3. Pure core: placement and prompt

- [x] 3.1 Implement the pending review store (`Map<threadId, PendingReview>`, add, remove, remove-by-ids, form drafts by `path:side:line`) and its `useSyncExternalStore` hook; verify unit tests: two threads stay separate, remove-by-ids leaves other comments, and form text survives an unmount of the reader
- [x] 3.2 Implement `placeComments(fileDiffs, comments)` returning placed per path and `notInDiff`, reusing or copying the hunk logic of `github-insight/core/diff-lines.ts` per the spike result; verify unit tests: new side, old side, context line, line outside hunks, and file not in the diff
- [x] 3.3 Implement `buildReviewPrompt(comments)`; verify a test with the spec example (`src/a.ts:42`, `src/b.ts:10 (deleted line)`), sort by path then line, and the closing instructions with no commit, push, or PR wording

## 4. Changes tab: diff view

- [x] 4.1 Register `threadPanelAction` "changes" in `app.tsx` and render the tab shell (summary "N files, +A -D", target picker, view toggle, refresh); verify a component test that the summary and picker show for a loaded diff and the tab is not offered on root compose
- [x] 4.2 Render one lazy file section per file with `FileDiff`, sticky header (path, previous path, counts), "Binary file", "Diff too large", and on-demand patch load when the section nears the view; verify component tests for each file kind and a renamed file
- [x] 4.3 Implement the target picker (All changes default, Uncommitted, Committed on branch, one entry per commit) and unified or split view; verify component tests that a picked commit calls `getChanges` with `commit(sha)` and split view passes the split option to `FileDiff`
- [x] 4.4 Implement loading, refresh, error with retry, and "No git repository for this thread"; verify component tests that the last diff stays visible during refresh and retry calls `getChanges` again
- [ ] 4.5 Write `bb-plugin-changes/README.md` and `PLUGIN_OVERVIEW.md` for the diff view (install command, SDK and bb versions, what the tab shows); verify the install command in the README runs as written

## 5. Inline comments and send

- [x] 5.1 Wire the gutter "+" to open `InlineCommentForm` below the line, one form per line and side, text from the store; verify component tests: "+" on an added line opens a new-side form, on a deleted line an old-side form, and the text stays after the section unmounts and mounts again
- [x] 5.2 Implement "Add to review" (disabled when blank, Cmd/Ctrl+Enter), Cancel, and Escape; verify component tests for each
- [x] 5.3 Render pending comments under their line with remove, the pending count in the header, and the "Not in this diff" section; verify component tests: remove lowers the count, and a comment on a line missing after refresh moves to "Not in this diff" with path, line, side, and text
- [x] 5.4 Implement "Send feedback (N)" and the dialog (editable prompt, Send with Cmd/Ctrl+Enter, Cancel drops edits, error stays in the dialog); verify component tests: disabled at 0, edited text is what `sendFeedback` gets, Cancel keeps all comments and drops edits
- [x] 5.5 After a successful send, remove the snapshot ids from the store and show "Sent to agent" or "Queued until the agent is idle"; verify component tests for both deliveries and for a failed send that keeps all comments
- [x] 5.6 Put the shared parts (`ReviewFileDiff`, `InlineCommentForm`, `PendingCommentCard`) in `review-ui/` or in `bb-plugin-changes/ui/` per spike 1.3, with props only and no RPC calls; verify the parts have their own component tests and no import of the plugin contract
- [x] 5.7 Update the README and `PLUGIN_OVERVIEW.md` with the review flow and the prompt format; verify every user-facing label in the docs matches the UI text in the tests

## 6. Integration

- [x] 6.1 Add `bb-plugin-changes` to the matrix in `.github/workflows/tests.yml` and to the root `README.md` plugin list; verify the workflow runs `npm ci` and `npm test` for it on the PR
- [x] 6.2 In the running app on a real worktree: open the Changes tab, add comments on two files (one added line, one deleted line), switch thread and back, send, and confirm the agent gets one message in the spec format and the comments leave the diff; record the result in the PR description
