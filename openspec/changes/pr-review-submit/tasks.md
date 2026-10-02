# Tasks

## 1. Pure core

- [x] 1.1 Move `diffLines` to `core/diff-lines.ts`, keep `placeThreads` on it, and add `checkAnchor(files, anchor)` that returns `ok` or the reason with the diff ranges of that side (D4); verify `core/diff-lines.test.ts` covers a single line, a range inside one hunk, a range across 2 hunks (rejected), a start after the line, an unknown path, and a file without a patch, and that `thread-placement.test.ts` still passes
- [x] 1.2 Add `core/review-drafts.ts` with the zod schemas for comment drafts and the summary draft, version `v: 1` (D1); verify a test that a malformed entry or another version reads as no draft
- [x] 1.3 Add `core/review-submit.ts`: `submitRules({ viewerIsAuthor, state, body, commentCount })` returns the verdicts to show and the disabled reason per verdict (spec "Submit panel", "Drafts stay after a restart"); verify a table test for own PR, other PR, empty body with Request changes, empty body with Comment and 0 or 2 drafts, merged, and closed

## 2. Host and GitHub

- [x] 2.1 Add `github/pr-head-query.ts` (`id`, `headRefOid`, `state`, `viewerDidAuthor`) and host handler `fetchPrHead` (D2); verify an args snapshot test and a parse test on a recorded response
- [x] 2.2 Add `github/review-mutations.ts` with `addPullRequestReview` and a `gh` call that sends the variables as JSON on stdin with `gh api graphql --input -`, and host handler `submitReview` (D1, risk "argument length"); verify a test that builds the JSON for 3 comments with one range, and verify against a test PR from `bb plugin dev` that one review with 3 comments is created
- [x] 2.3 Map the "one pending review" GitHub error to a message with the PR URL; verify a unit test on the recorded error text

## 3. Storage and service

- [x] 3.1 Extend `review/draft-store.ts` with comment drafts (`comment:` prefix) and the summary (`summary:` key): save, delete, list for a PR, delete all for a PR; verify `draft-store.test.ts` with a fake kv, and that reply drafts still work
- [x] 3.2 Extend `review-service.load` to run `fetchPrHead` in parallel and return `head` plus `commentDrafts` and `summaryDraft`; verify tests for "no PR", gh error, and the fixture result with drafts at the head and at an older commit
- [x] 3.3 Add RPCs `saveCommentDraft`, `deleteCommentDraft`, `saveSummaryDraft` to `contract.ts` and `server.ts`; only `deleteCommentDraft` publishes `review.updated`, because the tab saves are debounced, like reply drafts (D6); verify `server.test.ts` cases with a fake realtime
- [x] 3.4 Add RPC `submitReview({ threadId, event, body })`: load again, apply `submitRules`, send one review on the drafts' commit or the head, then delete the drafts, publish `review.updated`, and call `refreshAfterWrite` (D3, D6); verify `server.test.ts` cases: success deletes the drafts, a GitHub error keeps them, a merged PR is rejected, and nothing but one mutation is called

## 4. CLI and prompt

- [x] 4.1 Add `review comment <path> --line [--side] [--start-line] --body|--body-file` with `checkAnchor` and the one-commit rule (D3, D4); verify `review-cli.test.ts` for success, line outside the diff, unknown file, empty body, other commit, and not in a thread
- [x] 4.2 Add `review summary --body|--body-file` and extend `review list` text and `--json` with `comments` and `summary`; verify `review-cli.test.ts`
- [x] 4.3 Update `core/review-prompt.ts` (D7); verify `review-prompt.test.ts` checks for both command names and the "do not post" rule
- [x] 4.4 Document the new commands, the kv keys, and the submit flow in `README.md` under "Review threads"; verify every command in the README runs as written from an agent in a bb thread

## 5. Review tab

- [x] 5.1 Generalize `ui/draft-saves.ts` to take a save function and use it for reply, comment, and summary drafts; verify the existing `review-tab.test.tsx` draft cases still pass
- [x] 5.2 Show comment drafts at the head commit as line annotations in `ui/file-diff.tsx`, marked "Draft from agent", with edit and delete (D5); verify `renderSlot` tests on the fixture and that a `review.updated` event shows a new draft without a refresh
- [x] 5.3 Add the "Drafts on an older commit" section with the commit warning (D5); verify a `renderSlot` test with drafts at `abc123` and head `def456`
- [x] 5.4 Add the submit panel with the summary body, the draft count, the verdicts from `submitRules`, the disabled reasons, and the error with the PR link; verify `renderSlot` tests for own PR, other PR, empty body, a failed submit that keeps the drafts, and a merged PR
- [x] 5.5 Update the "Review tab" part of `README.md` with the draft and submit UI; verify it matches the running tab

## 6. End-to-end check

- [x] 6.1 From the Pull Requests panel, start "Review in thread" on a test PR of another person. Let the agent save 2 comments (one a range) and a summary. In the tab, edit one comment, delete the other, and submit Request changes. Verify on GitHub that exactly one review with 1 comment and the edited summary was created, and that the tab and `review list` show no drafts
- [x] 6.2 Save a comment draft, push a commit to the test PR, and open the tab. Verify the older-commit warning shows, submit Comment, and verify on GitHub that the comment is on the line of the old commit
