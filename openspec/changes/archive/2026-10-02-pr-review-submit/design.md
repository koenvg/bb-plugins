# Design

## Context

- The Review tab (`ui/review-tab.tsx`, `ui/file-diff.tsx`) already shows the PR files and review threads at the PR head, with reply drafts from the agent.
- Reply drafts live in plugin kv under `draft:<owner>/<repo>#<n>:<reviewThreadId>` (`review/draft-store.ts`). The CLI writes them, the tab edits them with a 500 ms debounce (`ui/draft-saves.ts`), and `review.updated` tells the tab to load again.
- `review/review-service.ts` loads the files (REST) and the threads (GraphQL) on each load, without a cache. It does not know the head commit, the PR node id, or who wrote the PR.
- `core/thread-placement.ts` already computes the lines of each side of a patch (`diffLines`).
- All GitHub writes go through `gh` on the thread's host (`host.ts`, `github/gh-write.ts`).

## Goals / Non-Goals

**Goals:**
- Reuse the reply draft pattern (kv, CLI, `review.updated`, debounced saves) for comment drafts and the summary draft.
- Catch bad anchors at save time in the CLI, so the agent can fix them, not at submit time in the tab.

**Non-Goals:**
- No GitHub pending review. Drafts stay in bb until submit.
- No re-anchoring of drafts to a new head commit.

## Decisions

### D1: Drafts in plugin kv, one GitHub write on submit

Comment drafts use the key `comment:<owner>/<repo>#<n>:<draftId>` with `{ v: 1, path, side, line, startLine, body, commitOid, updatedAt, source }`. The summary uses `summary:<owner>/<repo>#<n>` with `{ v: 1, body, updatedAt, source }`. `draftId` is a random short id that the CLI prints.

Submit runs one `addPullRequestReview` mutation with `pullRequestId`, `commitOID`, `event`, `body`, and `threads: [{ path, side, line, startLine, startSide, body }]`.

- Alternative: write each draft to a GitHub pending review at once. Rejected: the CLI would write to GitHub, each edit is a GitHub call, and it merges with a pending review that the user started on github.com.

### D2: Head commit and viewer from a new host call

Add host handler `fetchPrHead` (GraphQL: `id`, `headRefOid`, `state`, `viewerDidAuthor`). `review-service.load` runs it in parallel with the files and threads calls, and the result carries `head: { prNodeId, oid, state, viewerIsAuthor }`.

- Alternative: read `headOid` from the insight cache in `refresh/insight-service.ts`. Rejected: the cache can be up to 60 s old, so the CLI could save a draft with a wrong commit. The extra call is small and runs in parallel.

### D3: One commit for all comment drafts

The CLI saves `commitOid = head.oid`. It rejects a new draft when the PR has comment drafts at another commit (spec "One commit per set of comment drafts"). Submit sends `commitOID` of the drafts, so GitHub places each comment on the line the agent saw, even after a push.

- Alternative: allow mixed commits and submit one review per commit. Rejected: more than one review per submit, and the verdict would apply more than once.

### D4: Anchor check reuses `diffLines`

Export `diffLines` from `core/thread-placement.ts` (or move it to `core/diff-lines.ts`). A new pure `checkAnchor(files, { path, side, line, startLine })` returns `ok` or the reason with the diff ranges of that side. For a range, every line from `startLine` to `line` must be in the diff on that side, because GitHub rejects a range that leaves the hunk.

### D5: Tab layout

- Comment drafts at the head commit become extra `lineAnnotations` in `PrFileDiff`, next to the threads. The annotation metadata is a union `{ kind: "thread" } | { kind: "comment-draft" }`.
- Comment drafts at another commit show in a "Drafts on an older commit" section above the files, like the "Outdated" section (`ui/outdated-threads.tsx`).
- The submit panel sits in the tab header row, as a collapsible section. Its body edits the summary draft through the same debounced save hook. Generalize `useDraftSaves` to take a save function, so the reply, comment, and summary drafts share it.

### D6: New RPCs

`saveCommentDraft`, `deleteCommentDraft`, `saveSummaryDraft`, and `submitReview({ threadId, event, body })`. `submitReview` loads the review again on the server, builds the threads input from kv, and does not trust the tab's copy. After success it deletes the drafts, publishes `review.updated`, and calls `refreshAfterWrite` so the PR tab and the composer banner update.

### D7: Review prompt

`core/review-prompt.ts` step 4 changes to: save each finding with `bb github-insight review comment <path> --line <n> --body-file <file>`, and save one summary with `bb github-insight review summary`. The rule "Do not post comments or reviews to GitHub" stays.

## Risks / Trade-offs

- [The user has a pending review on github.com, so `addPullRequestReview` fails] -> Show the GitHub error with a link to the PR. Keep all drafts. Out of scope to merge with it.
- [A large review hits the `gh` argument length limit] -> Send the mutation variables as JSON on stdin (`gh api graphql --input -`), not as `-f` arguments.
- [The agent saves many small drafts] -> No limit in this change. `review list` shows them all, and the user can delete them in the tab.
- [A draft on a file that a later push removed] -> Submit on the old commit still works, because GitHub places it on that commit. The tab lists it in the older-commit section.
- [Drafts of a merged or closed PR stay in kv] -> Same as reply drafts today. Submit is disabled. A later cleanup can delete them.
