# Proposal

## Why

Some commit statuses stay `pending` until a person acts. Example: Chromatic "UI Review" stays pending with "Go review the new and updated UI" until someone approves the UI changes. github-insight counts every pending status as a running check, so the thread stays in In flight. The user does not see that the PR waits for them. On collibra/frontend#25932 this took about 23 hours.

The fix must work with no setup. It must change nothing for users who do not have such a status.

## What Changes

- github-insight gives a new check status, `waiting`, to a pending commit status (`StatusContext`) when:
  - no check run (`CheckRun`) is still running, and
  - the last update of that status is 3 minutes old or more.
- github-insight adds a new merge blocker `checks_waiting` with text "<name> waiting for you" (one check) or "N checks waiting for you".
- The PR summary has a new `checks.waiting` count. `checks.running` no longer counts waiting checks.
- The PR panel shows waiting checks in the open check groups with their own icon.
- "Enable auto-merge" stays available when a check is waiting, the same as when a check is running.
- pr-thread-list reads `checks_waiting` and puts the thread in Needs attention. The sidebar row shows "waiting for you".
- tasks-plus accepts the new `checks.waiting` count and `checks_waiting` blocker, and shows "Checks waiting for you". Without this, its strict summary schema rejects every PR summary.
- No settings. No name or URL match on Chromatic.

## Capabilities

### New Capabilities

- `pr-waiting-checks`: How github-insight finds checks that wait for a person and reports them in the PR panel, the blockers, and the PR summary.

### Modified Capabilities

- `sidebar-thread-tabs`: "PR status decides the tab of an idle thread" adds waiting checks to the PR states that put a thread in Needs attention.
- `pr-auto-merge`: "Enable auto-merge button" also accepts the "waiting for you" blocker.

## Impact

- `bb-plugin-github-insight`: `core/checks.ts`, `core/blockers.ts`, `core/overview.ts` (clock input), `core/summary.ts`, `core/auto-merge.ts`, `core/banner.ts`, `ui/pr-tab.tsx`, `ui/blocker-tone.ts`, tests.
- `bb-plugin-pr-thread-list`: `pr-insight.ts`, `tabs.ts`, `pr-status.ts`, `pr-badge.tsx`, tests.
- `bb-plugin-tasks-plus`: `shared/contract.ts`, `api/work-status-conditions.ts`, `views/list/pr-presentation.ts`, `views/list/pr-rich-detail.tsx`, tests.
- Summary format stays `version: 1`. The new key and blocker code are additive for pr-thread-list, but tasks-plus validates the summary strictly, so it must ship with this change. An old pr-thread-list ignores the unknown blocker. It then sees no running checks, so it also puts the thread in Needs attention.
- No new GitHub API calls. The existing 60 second poll moves the PR when the 3 minutes pass.
