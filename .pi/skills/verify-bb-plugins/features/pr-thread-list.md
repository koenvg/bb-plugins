# Threads with PRs sidebar

Users select a sidebar that groups thread trees by attention/run state and shows GitHub Insight PR status without storing Git credentials.

## Sub-features

- pr-sidebar-select: native Sidebar selection and fallback to bundled Thread list.
- pr-sidebar-tabs: Needs attention, In flight and All with keyboard navigation.
- pr-sidebar-tree: child-tree placement, unread/run/approval state and snoozed threads.
- pr-sidebar-badge: PR summary badge opens the linked PR Overview.

## How to get to it (user POV)

- With approval, select Threads with PRs in Settings > Appearance > Sidebar.
- Use Needs attention, In flight and All tabs; arrow keys move between tabs.
- Open a thread row normally or choose its PR badge.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-pr-thread-list/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Run package tests/typecheck. Doctor checks exact installed source, the active sidebar selection and github-insight availability/actual linked PR. Without GitHub Insight, observe the explicit notice and no PR badge; this is not badge acceptance. Record the previous sidebar choice before an approved change. In installed BB, switch tabs with the keyboard and verify a known owned thread/tree appears in the expected group using actual thread signals. Select a row to prove ordinary navigation, then its PR badge to prove correct-thread PR Overview navigation even when the banner is hidden. Capture tab selection, tree placement, badge action and destination. Do not create tasks/threads or mark other people's output read just to manufacture classification cases; list missing prerequisites.

## Gotchas

- Sidebar selection is user state; restore only if it still matches what this run selected.
- Tabs have no counts and only active threads appear in the first two tabs.
- Snoozed trees appear under All. A tree moves as one unit.
- GitHub Insight owns authentication and PR data; this sidebar owns neither.
