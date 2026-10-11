# Proposal

## Why

BB already displays a native background-agent bar above the composer, but clicking it does not open Subagents. Make that existing bar open the panel through a temporary content-script workaround, without adding another bar.

## What Changes

- Add pointer and keyboard navigation to the existing native composer bar for this provider's background work. Do not add a visible banner, button, or replacement bar.
- Open the existing Subagents side panel in the same thread through SDK navigation. Select the matched agent for a single-run bar; open the overview without selecting a run for aggregate and narrow bars, including before first expansion.
- Keep native text, timing, activity counts, and expand/collapse behavior. Leave the transcript background-agent indicator unchanged.
- Match the supported native DOM shape against validated background observations belonging to the current thread. Leave unmatched elements untouched rather than guess ownership.
- Remove added listeners, observers, focus styling, and accessibility attributes on plugin teardown or when a bar stops matching.
- Document that DOM matching is a temporary compatibility exception. A BB UI update can disable this shortcut; the manual Subagents panel entry remains available.

## Capabilities

### New Capabilities

- `pi-subagents-observability`: Add native composer-bar navigation and bounded content-script compatibility requirements. This capability exists in the pending `pi-subagents-provider` change but has no archived spec. Reuse its exact path with distinct ADDED requirements and preserve the pending requirements.

### Modified Capabilities

None. No archived requirement changes.

## Impact

- Affected package: `bb-plugin-pi-subagents-provider` frontend registration, content-script adapter, thread-scoped SDK navigation context, bounded event-history reader, panel selection, tests, and `SUBAGENTS.md`.
- Use supported content-script registration and SDK history/panel navigation, but accept a narrow dependency on BB 0.45.0's observed native composer DOM. This is no longer an SDK-only solution.
- No extra visible composer UI, transcript interception, native task payload changes, backend launch or capture changes, BB core/SDK changes, new dependencies, or user-setting changes.
- Keep the existing change name. The user outcome remains composer-to-Subagents navigation; the implementation now acts on the native bar rather than introducing a duplicate.
- Planning only. Installation, reload, and live child execution require separate approval during apply.
