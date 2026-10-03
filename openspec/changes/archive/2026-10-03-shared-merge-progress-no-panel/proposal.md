# Proposal

## Why

The PR tab and chat banner show different loading states for the same merge. The palette merge command also opens the side panel before showing confirmation, which changes the user's layout without a need.

## What Changes

- Share merge and enqueue progress between the PR tab and composer banner for the same thread in the same window. Disable both actions while a write runs and prevent duplicate requests across entry points.
- Let "GitHub: Merge PR" open the existing confirmation dialog without opening, closing, or focusing a side-panel tab. Keep enqueue immediate, without a dialog.
- Show palette progress, errors, and unavailable-action messages in the chat banner. Do not open the panel for an error.
- Preserve confirmation, merge method selection, head-commit checks, and PR refresh after success. Keep the explicit "Open PR tab" command and banner text navigation.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pr-merge-actions`: Share operation progress and duplicate-request protection across the tab, banner, and palette; keep feedback visible in the banner.
- `pr-commands`: Run merge confirmation or enqueue from the chat view without opening the PR tab, including stale availability and error paths.

## Impact

- `bb-plugin-github-insight/ui/use-merge-action.ts`, `merge-action-button.tsx`, `composer-banner.tsx`, `commands.ts`, `command-intents.ts`, and `pr-tab.tsx`.
- Existing UI tests in `app.test.tsx` and `ui/commands.test.tsx`, plus focused tests for shared operation state.
- Update the plugin README and overview, which currently describe separate busy states and panel-first palette merging.
- No new dependency, RPC contract, GitHub mutation, or persistent data format is expected.

## Non-goals

- Do not change other palette commands, merge methods, permissions, queue policy, or agent/CLI write access.
- Do not synchronize progress across separate BB windows or persist pending user actions across restarts.
- Do not install or implement the change during proposal creation.
