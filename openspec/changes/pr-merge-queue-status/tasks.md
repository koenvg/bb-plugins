# Tasks

## 1. github-insight: detect the queue entry

- [ ] 1.1 Add `mergeQueueEntry { position state }` to the first-page block in `github/overview-query.ts`, and verify `github/overview-query.test.ts` asserts the field is in the query
- [ ] 1.2 Parse the entry in `core/overview.ts` and map it to `PrInsight.mergeQueue` (`QUEUED`, `AWAITING_CHECKS`, `MERGEABLE`/`LOCKED`, `UNMERGEABLE`, null), and verify each mapping with a test in `core/overview.test.ts`
- [ ] 1.3 Add `mergeQueue` to `BlockerInput` and return `[]` from `buildBlockers` while it is not null, and verify a test in `core/blockers.test.ts` for a queued PR with `BLOCKED` and `REVIEW_REQUIRED`
- [ ] 1.4 Verify in `core/banner.test.ts` that a queued PR gets no banner

## 2. github-insight: summary and PR tab

- [ ] 2.1 Add the optional `mergeQueue` field to `PrSummary` in `core/summary.ts`, and verify `core/summary.test.ts` covers a queued PR (`{ position, state }`, `blockers: []`, `version: 1`) and a PR not in a queue (`null`)
- [ ] 2.2 Show the queue text in `ui/pr-tab.tsx` ("In merge queue (#N)", "Merge queue checks running (#N)", "Merging", "Merge queue failed" in the problem tone), and verify with a test in `app.test.tsx`
- [ ] 2.3 Document the `mergeQueue` summary field and the queue states in `bb-plugin-github-insight/README.md`, and verify the README field list matches `PrSummary`

## 3. pr-thread-list: read and show the queue state

- [ ] 3.1 Read `mergeQueue` in `pr-insight.ts` (missing or invalid reads as `null`), and verify with tests in `pr-insight.test.ts` for a valid entry, a missing field, and a bad state
- [ ] 3.2 Add the `queued`, `awaiting_checks`, `merging`, and `failed` reasons to `pr-status.ts` with the words, tones, and marks from design.md, and verify with tests in `pr-status.test.ts`
- [ ] 3.3 Put `failed` in Needs attention and the other queue states in In flight in `tabs.ts`, and verify with tests in `tabs.test.ts`
- [ ] 3.4 Document the queue states in `bb-plugin-pr-thread-list/README.md`, and verify the README lists every new row status

## 4. Integration

- [ ] 4.1 Run the test suite and typecheck in both plugins, and verify they pass
- [ ] 4.2 Run `openspec validate pr-merge-queue-status --strict`, and verify it passes
