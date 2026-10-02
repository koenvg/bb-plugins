# Threads with PRs

A selectable BB sidebar thread list. It shows threads in three tabs and the PR status beside each thread. The PR status comes from the **github-insight** plugin. This plugin stores no Git host credentials.

Build: `npm install && bb plugin types && bb plugin build`. Install locally: `bb plugin install .`. Choose **Threads with PRs** in Settings → Appearance → Sidebar. The bundled **Thread list** stays installed and can be selected again at any time.

## Requirements

- Install and enable the **github-insight** plugin. It needs the GitHub CLI (`gh`), signed in.
- Without github-insight, rows show no PR badge, the tabs use only thread signals, and a notice above the rows says that PR status needs it.

## Tabs

The tabs above the rows are **Needs attention**, **In flight**, and **All**. They show no counts. Use the arrow keys to move between them. The list opens on the tab you used last, or on **Needs attention** the first time.

**Needs attention** and **In flight** show only active threads. Each active thread is in one of them. The first rule that matches decides:

| Rule | Tab |
|---|---|
| Waits for an approval or an answer, has an unread error, or has a queued message that failed to send | Needs attention |
| Has unread output | Needs attention |
| Runs, has background work, or has a queued message that waits | In flight |
| Has an active child thread, at any depth (runs, has background work, has a queued message, or needs you) | In flight |
| Has no PR, or no usable PR summary | Needs attention |
| Open PR has a failed merge queue entry | Needs attention |
| Open PR is queued or merging in a merge queue | In flight |
| PR has failed checks, requested changes, conflicts, or unresolved comments | Needs attention |
| Open PR has checks running or waits for a required review | In flight |
| Any other PR (ready, draft, behind, blocked, merged, closed) | Needs attention |

A thread tree moves as one unit. The whole tree shows in **Needs attention** when the top thread goes there, or when a child needs you, has unread output, or has a PR problem (failed checks, requested changes, conflicts, unresolved comments, or a failed merge queue entry). A finished child with no PR, or with a ready, draft, merged, or closed PR, does not move its tree. Else the whole tree shows in **In flight**. Each child stays under its parent.

**All** shows every thread, with the **Needs you** group on top.

The tab of a thread does not depend on whether its row is on screen. The `summary-watch` service on the plugin server reads the github-insight summary of every active thread every 5 seconds. When a summary changes, it sends a `summaries.changed` realtime signal, and the list loads the summaries again. github-insight refreshes a PR when its thread goes idle, so a PR that an agent opens or pushes to shows within seconds. Changes on GitHub only, such as a finished check, come from github-insight's 60 second poll. When you resolve or unresolve a review thread in github-insight's Review tab, the list asks at once. As a fallback, the list also asks once a minute and when the connection comes back.

## List preferences

Open **List options** to group by project, machine, or custom section and to change the sort order. In **All**, List options also selects Active, Archived, or Both. The other tabs ignore this choice. Group and parent-thread headers collapse their descendants. The top thread of a tree decides its group and its pin: a tree shows in the project, section, or machine of its top thread, and in **Pinned** only when the top thread is pinned. Pinned trees stay at the top of their tab. When the archived selection leaves out the parent of a shown thread, and the list has that parent loaded, the parent shows as a dimmed row. It does not count in the group count. A child of a hidden or not loaded parent shows as a top-level row.

These choices, and the selected tab, are saved on this client under a versioned plugin key. They do not migrate from BB's bundled list. **Reset list preferences** restores the defaults: Needs attention, project grouping, active threads, newest first. If browser storage is unavailable, the list still works, but choices last only until reload.

## Triage

In **All**, **Needs you** sits above all other groups. It holds every tree with one or more threads that wait for an approval or an answer, have an unread error, or have a queued message that failed to send. The whole tree shows there, with its nesting.

Each row starts with the logo of the agent that runs it. A red dot on the logo means the thread needs you. A blue dot means it is unread. The top right shows what the thread does now (**Needs you**, **Failed**, **Not sent**, **Working**, **Planning**, **Draft**, and similar), or its age when it does nothing.

## PR badges

A thread row with a PR shows a PR icon on the right of the second line. The PR icon is draft, merged, or closed. For an open or draft PR, its colour shows checks: green when all passed, amber while running, red when one failed, grey when unknown. Hover it for the PR number. Each merge blocker that github-insight reports has an icon: conflicts, checks failed, changes requested, blocked, checks running, awaiting review, and unresolved comments. Problems come first. Failed checks, running checks, and pending reviews show a count, and the tooltip names them. Only problems (**Checks failed**, **Changes requested**, **Conflicts**, **Blocked**), **Ready**, **Merged**, and the merge queue states below also show a word. A branch that is out of date gets no icon. It shows only in the tooltip. A merged PR shows its icon and word in purple.

An open PR in a merge queue shows its queue state instead of its blockers:

| Queue state | Word | Tone | Icon |
|---|---|---|---|
| `queued` | **Queued #N** | waiting | none |
| `awaiting_checks` | **Queued #N** | waiting | running checks |
| `merging` | **Merging** | ready | none |
| `failed` | **Queue failed** | problem | checks failed |

A summary without `mergeQueue`, or with an invalid one, reads as not queued.

The left of the second line shows queued messages and background work (workflows, agents, commands, plan mode, goals) as icons with counts. When there is none, it shows the branch. The badge opens the PR without opening the thread. Threads that share an environment show the same PR.

There is no badge while the summaries load, when there is no PR, or when the summary is not usable. An open or draft PR summary older than one hour is not usable. A merged or closed PR summary stays usable at any age. No badge does not mean that checks passed or that a PR was closed.

## Rollout and fallback

Try the plugin on one client first. In Settings → Appearance → Sidebar, select **Threads with PRs**. To roll back, select **Thread list** there; both plugins remain installed, and no thread or PR data needs migration. The replacement's grouping and collapse settings are separate from the bundled list's settings, so switching back does not overwrite them.

Before daily use, note the current parity gaps: group ordering and row density do not exactly match the bundled list; there is no hover-to-archive button, section reorder/delete, or group hide control. Archive, section rename, and thread actions remain available through menus. The plugin currently offers project, machine, and section grouping, not every bundled presentation detail. Recheck these interactions and the experimental SDK contract after BB updates.
