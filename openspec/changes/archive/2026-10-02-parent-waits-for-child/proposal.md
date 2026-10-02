# Proposal

## Why

A parent thread that waits for a running child thread shows in Needs attention. The user has nothing to do on the parent, so the row is noise in the tab that must show only work for the user.

## What Changes

- An idle, read parent thread with an active child thread goes to In flight.
- A child thread is active when it runs, has background work, has a queued message, or needs the user.
- Grandchildren and deeper descendants count. Archived and hidden children do not count.
- The parent's own signals still win first: a pending approval, an unread error, a failed queued message, or unread output keeps the parent in Needs attention.
- The child-thread rule comes before the PR rules.
- The README tab rule table gets the new row.

## Capabilities

### New Capabilities

### Modified Capabilities
- `sidebar-thread-tabs`: the thread signal rules add an active child thread as an In flight signal.

## Impact

- `bb-plugin-pr-thread-list/tabs.ts`: tab rule gets the active descendants.
- `bb-plugin-pr-thread-list/list-model.ts`: tab filter gives each thread its descendants from the full thread list.
- `bb-plugin-pr-thread-list/README.md`: rule table.
- No SDK or github-insight change.
