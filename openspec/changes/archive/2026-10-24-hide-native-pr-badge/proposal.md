# Proposal

## Why

GitHub Insight's composer banner duplicates BB's native PR status. Keep the custom plugin while removing that visual duplication without losing BB's file controls or PR actions.

## What Changes

- Add a narrowly scoped, temporary CSS workaround in GitHub Insight to hide only the native composer PR badge.
- Preserve the custom banner, committed/changed-file controls, and native merge/mark-ready actions.
- Limit suppression to composers displaying the custom banner; restore the native badge when the custom banner is absent or the plugin is disabled.
- Document the dependency on BB's current DOM and how to remove the workaround.

## Capabilities

### New Capabilities

- `github-insight-composer-deduplication`: Suppress duplicate native PR badges without hiding other composer controls.

### Modified Capabilities

None.

## Impact

GitHub Insight frontend registration/banner styling, focused frontend tests, and README. No BB core modifications, backend changes, credentials, polling changes, or new dependencies are intended. BB DOM changes may cause the native badge to reappear; the workaround must not broaden its target in that case.
