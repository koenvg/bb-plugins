# Proposal

## Why

The thread list shows all threads in one stream. The user cannot see quickly which threads wait for them and which threads still do work. OpenForge solves this with Focus and In Flight lanes. This list must use the same rules.

The PR status cannot decide the tab today. BB looks up a PR only for a row on screen, so a thread off screen has no PR status. The github-insight plugin already polls the PR of every active thread, so it can supply the PR status for all threads.

## What Changes

- Add three tabs above the rows: **Needs attention**, **In flight**, and **All**. The tabs show no counts.
- Needs attention and In flight show only active threads. They use one set of ordered rules from thread signals and PR status.
- All shows the same list as today, including the **Needs you** group.
- **BREAKING**: move the Active / Archived / Both selector from the top of the list into List options. It applies only to the All tab.
- **BREAKING**: github-insight becomes the only source of PR status for the tabs and for the row badges. The list stops using `experimental_useSidebarThreadPullRequest`. Without github-insight, rows show no PR badge, and a notice tells the user to install it.
- The list reads the github-insight summaries for all active threads in one request each minute, not one request per visible row.
- Save the selected tab with the other list preferences.

Non-goals:

- No manual "Set aside" (OpenForge Out of Focus) action.
- No tab counts.
- No change to github-insight polling or to its summary format.

## Capabilities

### New Capabilities

- `sidebar-thread-tabs`: put each active thread in Needs attention or In flight with ordered rules, and show the three tabs.

### Modified Capabilities

- `sidebar-thread-list`: the active and archived selector moves into List options and applies only to All. The PR status on each row comes from the github-insight summary, not from BB's per-row lookup.

## Impact

- `bb-plugin-pr-thread-list`: `app.tsx`, `list-model.ts`, `row-cues.ts`, `preferences.ts`, `pr-status.ts`, `pr-insight.ts`, `pr-badge.tsx`, `server.ts` (gets an RPC), tests, and README.
- New runtime dependency on the `github-insight` plugin and its `prSummary` thread metadata (version 1).
- No change to `bb-plugin-github-insight`.
- Saved preferences stay at version 1. A missing tab value reads as the default.
