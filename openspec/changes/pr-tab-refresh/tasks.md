# Tasks

## 1. Spike

- [x] 1.1 With `gh api graphql`, run the extended overview query (D3) on an open PR that has a required check, an optional check, and a status context; verify `isRequired`, `autoMergeRequest`, `autoMergeAllowed`, branch fields, and diff counts come back, and record a trimmed response as a test fixture
- [x] 1.2 In a running bb, call `sdk.environments.status({ environmentId, mergeBaseBranch: "origin/<headRefName>" })` on a thread worktree with 2 unpushed commits and with 0; verify `mergeBase.commits` has 2 and 0 entries, and record the result in design.md D6 (or the fallback if it does not work)

## 2. PR data

- [x] 2.1 Extend `github/overview-query.ts` and `core/overview.ts` with the D3 fields; verify parser tests for a same-repo PR, a fork PR, a required and an optional check, and auto-merge on and off
- [x] 2.2 Add pure `buildBranchUpdateAction` and `buildAutoMergeAction` in `core/`; verify unit tests for every scenario of the "Update branch button" and "Enable auto-merge button" requirements
- [x] 2.3 Add a pure summary-line function (first blocker, "+N more", ready, queued, auto-merge on, none for merged or closed); verify unit tests for each "Summary line" scenario

## 3. Server snapshot

- [x] 3.1 Store the last good reading per PR in kv under `insight:<owner>/<repo>#<number>` with a versioned zod schema, written only when the data changed; verify insight-service tests: write on change, no write on same data, bad stored value is dropped
- [x] 3.2 On a memory miss, return the stored reading with its original `refreshedAt` and start a background refresh that publishes an update; verify a test that a fresh service with a filled kv returns the stored reading without waiting for `fetchInsight`, then publishes
- [x] 3.3 Prune stored readings of PRs that no unarchived thread links to on each poll; verify a test with one linked and one unlinked stored PR

## 4. Client snapshot

- [x] 4.1 Add a module-level snapshot map and seed `useThreadResult` from it, with a `revalidating` flag; verify hook tests: return to a thread shows the old result with no `null`, a switch to an unknown thread never shows another thread's result, `no_pr` clears the entry
- [x] 4.2 Show "Updated <age>" always in the PR tab, with an updating indicator while `revalidating` or `refreshing`; verify rendered tests for "Updated 3 hours ago", the indicator, and a failed background load that keeps the snapshot

## 5. Layout

- [x] 5.1 Render the new header (number, state, `head -> base`, +/-, files, author, title) in `ui/pr-tab.tsx`; verify rendered tests for the "PR header" scenarios
- [x] 5.2 Render the summary line below the header; verify rendered tests for one blocker, several blockers, ready, and merged
- [x] 5.3 Add the "required" label and merge passed and skipped checks into one collapsed line; verify rendered tests for the "Required checks label" and "Passed and skipped checks in one line" scenarios
- [x] 5.4 Update `PLUGIN_OVERVIEW.md` and `README.md` for the snapshot, header, summary line, and check list; verify the text matches the specs

## 6. Shared write path

- [x] 6.1 Generalize `createMergeWrites` and the app merge operation state into PR writes with a `kind` (D5), one operation per thread across all kinds; verify the existing merge-flow and merge-operations tests still pass, plus a test that a branch update and a merge for one thread send one write

## 7. Update branch

- [x] 7.1 Add the `updatePullRequestBranch` mutation args and host handler; verify an args test for `MERGE` and `REBASE` with `expectedHeadOid`
- [x] 7.2 Add the `localCommitsAhead` RPC and its host git handler (D6) with `count` and `unknown` results; verify tests for a count, no environment, other branch, fork PR, no remote ref, and a failed git command
- [ ] 7.3 Render the "Update branch" split button, the rebase confirm dialog, the disabled rebase item with its reason, "Updating…", errors, and the pull reminder; verify rendered tests for every scenario in the `pr-branch-update` spec
- [ ] 7.4 Document "Update branch" in `PLUGIN_OVERVIEW.md` and `README.md`; verify the text matches the spec

## 8. Auto-merge

- [x] 8.1 Add the `enablePullRequestAutoMerge` and `disablePullRequestAutoMerge` mutation args and host handlers; verify args tests
- [ ] 8.2 Render "Enable auto-merge (<method>)", "Auto-merge on (<method>)" with "Disable", "Enabling…", "Disabling…", and errors; verify rendered tests for every scenario in the `pr-auto-merge` spec
- [ ] 8.3 Document auto-merge in `PLUGIN_OVERVIEW.md` and `README.md`; verify the text matches the spec

## 9. Integration

- [ ] 9.1 Verify `bb github-insight --help` shows no write command for merge, branch update, or auto-merge, and the composer banner and palette offer no branch update
- [ ] 9.2 Run `npm test`, typecheck, and lint for `bb-plugin-github-insight`; verify all pass
- [ ] 9.3 In a running bb: switch between 2 threads with PRs and verify no loading notice on return; restart bb and verify the stored data shows with its age; update a behind branch with merge; verify rebase is disabled with unpushed commits; enable and disable auto-merge on a PR with running checks
