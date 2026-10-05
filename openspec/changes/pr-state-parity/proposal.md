# Proposal

## Why

A draft PR can appear in the right-hand PR panel while no PR status appears above the composer. Users need the bottom banner to show the same PR state as the side panel, independently of merge blockers or available actions.

## What Changes

- Show every known PR lifecycle state in the bottom banner: Draft, Open, Closed, and Merged. Keep Draft visible with no blockers and alongside other blockers.
- Separate the lifecycle state from blocker, readiness, queue, and operation messages. An open PR without a merge action still shows Open, not a blank banner or a false ready message.
- Use one presentation mapping for lifecycle labels and queue detail in the PR tab and banner. Show queue position, checks running, merging, and queue failure consistently.
- Show initial loading and read failures above the composer. Keep the last good state with a stale-data warning and retry after a failed refresh. Hide normal PR status only after a confirmed no-PR result.
- Keep existing merge/enqueue eligibility, confirmation, head guards, shared progress, and click-to-open-panel behavior. Drafts and terminal PRs never gain merge actions.
- Preserve the host's changed-file controls and existing Mark ready action. Do not add a plugin mark-ready write.

## Capabilities

### New Capabilities

- `pr-status-presentation`: Consistent PR lifecycle, queue detail, and data-availability presentation in the right-hand PR panel and composer banner.

### Modified Capabilities

- `pr-merge-actions`: Replace hidden draft/open-without-action/closed banner cases with persistent PR status, show detailed queue outcomes, and preserve safe shared operation feedback.

## Impact

- Target package: `bb-plugin-github-insight`. Main areas are `core/banner.ts`, `ui/composer-banner.tsx`, the lifecycle and queue mappings in `ui/pr-tab.tsx`, and focused presentation tests. Add a small shared presentation module rather than a second data source.
- Reuse `PrInsight`, `useInsight`, existing RPCs, and `insight.updated`. No summary-contract change, polling change, new GitHub request, dependency, or BB core/SDK change is planned.
- Update the package README and plugin overview to describe the full state matrix. Existing tests that expect a closed or actionless open PR to hide must change.
- The older `github-pr-insight` change says merged and closed banners are hidden. The durable `pr-merge-actions` spec already supersedes that for merged PRs; this change explicitly replaces its remaining closed-hidden rule. Do not edit that older change as part of this proposal.
- Native badge suppression is separately tracked in BBP-113 and `hide-native-pr-badge`. Do not change its CSS here. Browser acceptance must verify that file controls and Mark ready remain usable; report an existing host-control failure rather than broaden this change silently.
- Planning only. This proposal does not authorize implementation, installation, live PR writes, or worker dispatch.
