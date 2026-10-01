# Threads with PRs

A selectable BB sidebar thread list. It uses BB's branch PR lookup to show PR status beside each thread; no Git host credentials are stored by this plugin.

Build: `npm install && bb plugin types && bb plugin build`. Install locally: `bb plugin install .`. Choose **Threads with PRs** in Settings → Appearance → Sidebar. The bundled **Thread list** stays installed and can be selected again at any time.

## List preferences

Use the lifecycle selector above the rows for Active, Archived, or Both. Open **List options** to group by project, machine, or custom section and change the sort order. Group and parent-thread headers collapse their descendants. These choices are saved on this client under a versioned plugin key; they do not migrate from BB's bundled list, so the first selection starts at project/active/newest-first defaults. **Reset list preferences** restores those defaults. If browser storage is unavailable, the list still works, but choices last only until reload.

## Triage

**Needs you** sits above all other groups. It holds every thread that waits for an approval or an answer, has an unread error, or has a queued message that failed to send. These signals come from the thread list itself, so the group is complete even for rows that are scrolled out of view. PR problems do not move a thread into this group, because BB looks up PRs only for visible rows; they show on the row instead.

Each row starts with the logo of the agent that runs it. A red dot on the logo means the thread needs you; a blue dot means it is unread. The top right shows what the thread does now (**Needs you**, **Failed**, **Not sent**, **Working**, **Planning**, **Draft**, and similar), or its age when it does nothing.

## PR badges

Each visible thread row with a branch PR shows a PR icon and an icon for BB's status on the right of the second line. The PR icon is draft, merged, or closed, and for an open PR its colour shows checks: green when all passed, amber while running, red when one failed, grey when unknown. Hover it for the PR number and title. Checks running, checks failed, awaiting review, changes requested, and conflicts each have their own icon. Only problems (**Checks failed**, **Changes requested**, **Conflicts**, **Blocked**), **Ready**, and **Merged** also show a word. A merged PR shows its icon and word in purple. The tooltip gives the full status.

The left of the second line shows queued messages and background work (workflows, agents, commands, plan mode, goals) as icons with counts. When there is none, it shows the branch. The badge opens the PR without opening the thread. This is the branch PR of the thread's environment: threads sharing an environment can show the same PR. BB owns the Git-host lookup, caching, and refresh; the plugin does not run `gh`. There is no badge while the first lookup is pending, when there is no PR, or when the lookup cannot run. Absence of a badge does not mean checks passed or that a PR was closed.

If the **github-insight** plugin is installed, each visible row with an open PR reads its summary once a minute. The badge then counts failed checks, running checks, or pending reviews when they match BB's status, and the tooltip names them. When BB reports **Blocked**, the badge shows an icon for every reason BB cannot report itself: checks running, awaiting review, and unresolved comments. A branch that is out of date gets no icon; it shows only in the tooltip. Hover an icon to see its detail. github-insight refreshes once a minute, so a new PR can show **Blocked** for a minute or two. A summary older than one hour, or for another PR, is ignored.

## Rollout and fallback

Try the plugin on one client first. In Settings → Appearance → Sidebar, select **Threads with PRs**. To roll back, select **Thread list** there; both plugins remain installed, and no thread or PR data needs migration. The replacement's grouping and collapse settings are separate from the bundled list's settings, so switching back does not overwrite them.

Before daily use, note the current parity gaps: group ordering and row density do not exactly match the bundled list; there is no hover-to-archive button, section reorder/delete, or group hide control. Archive, section rename, and thread actions remain available through menus. The plugin currently offers project, machine, and section grouping, not every bundled presentation detail. Recheck these interactions and the experimental SDK contract after BB updates.
