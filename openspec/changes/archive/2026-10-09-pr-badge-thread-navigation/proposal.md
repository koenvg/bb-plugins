# Proposal

## Why

The sidebar PR badge currently opens GitHub, taking the user away from BB to inspect checks or review status. Clicking any part of the badge should instead open that row's thread and select its PR tab inside BB.

## What Changes

- Make the whole badge one accessible action, covering checks, review and conflict icons, counts, and status text.
- Open the clicked thread and select github-insight's existing PR panel, including when that thread is already active or its panel is closed.
- Preserve ordinary thread-title navigation, split actions, badge presentation, summary freshness rules, and compact-viewport sidebar dismissal.
- Replace the existing requirement that badge activation opens the external PR without navigating to the thread. External GitHub links inside the PR panel remain unchanged.
- Add a client-local navigation handoff between pr-thread-list and github-insight, since the pinned SDK's panel-opening API only targets the caller's own plugin.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `sidebar-thread-list`: Change PR badge activation from an external GitHub link to thread navigation followed by selection of the thread's PR panel.

## Impact

- `bb-plugin-pr-thread-list/pr-badge.tsx`, `app.tsx`, and `app.test.tsx` need the new action and navigation coverage.
- `bb-plugin-github-insight/ui/composer-banner.tsx` already runs in the destination thread and can host the receiving hook independently of whether a blocker banner is visible. Its `app.tsx` registers the destination `pr` action.
- A small shared client contract, owned by github-insight and imported by the sidebar plugin, will carry a one-shot request without any GitHub write or backend RPC.
- The sidebar README must describe the new activation behavior. No summary schema, tab classification, GitHub API, or SDK dependency change is planned.
