# Proposal

## Why

Code Cleanup is enabled through a CLI, but it has no visible Settings controls. The user needs to see and change project enablement and prompts inside BB, and to choose whether future projects receive cleanup guidance by default.

## What Changes

- Add Code Cleanup to the Settings sidebar and its plugin detail page. Show a default-enable switch, an explicit project selector, a project enable switch, and a prompt editor with Save and Reset controls.
- Add an opt-in default for projects that have no explicit enablement choice. Allow a project to follow that default or remain explicitly enabled or disabled.
- Preserve existing project enablement and exact custom prompt text. The 12 currently configured projects must not change behavior when the plugin is upgraded.
- Make the factory prompt record substantial cleanup through the installed `bb tasks` CLI, as requested earlier in this discussion. Project-specific prompts still replace it. This deliberately changes the current reporting-only factory prompt and the existing guidance specification.
- Keep CLI and Settings changes in the same saved configuration. Validate prompts on the server and show loading, save, validation, and failure states in the UI.
- Explain that prompt changes affect newly constructed agent sessions, and that missing task trackers prevent task creation. The controls do not create trackers or dispatch work.

## Capabilities

### New Capabilities

- `code-cleanup-settings`: Discoverable Settings controls for default enablement, project overrides, and custom guidance, with safe editing and visible persistence results.

### Modified Capabilities

- `code-cleanup-guidance`: Allow default-based enablement alongside explicit project choices, preserve existing configuration, and use task-creation guidance with duplicate checks and safe tracker routing instead of the reporting-only factory prompt.

## Impact

- Affects `bb-plugin-code-cleanup/`: its backend factory, project-settings storage, factory guidance, tests, manifest, README, and command reference. Adds a frontend entry and validated Settings RPC contract.
- Uses the installed public BB Plugin SDK Settings descriptors, `settingsSection`, RPC, realtime, and testing interfaces. Adds frontend test/build dependencies and JSX configuration within this package only.
- Adds an append-only storage migration. Existing CLI commands and saved prompts remain compatible; a new enablement-reset command lets CLI users return a project to the default.
- Changes the factory prompt after Reset and for newly enabled projects without custom text. No stored custom prompt is rewritten.
- Does not change BB core, existing task projects, other plugins, or live provider sessions. No implementation or live configuration changes occur during this proposal.
