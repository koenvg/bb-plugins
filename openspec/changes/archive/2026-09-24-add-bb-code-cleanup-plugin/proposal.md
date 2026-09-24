# Proposal

## Why

OpenForge's Code Cleanup plugin helps agents notice substantial cleanup near their current work without derailing the task. BB needs that behavior as a standalone, project-scoped plugin, not a repository instruction that remains in effect after the plugin is disabled.

## What Changes

- Add a headless BB Code Cleanup plugin that contributes guidance only to projects explicitly enabled for it. Global plugin disablement stops new contributions.
- Tell agents to use judgment: record worthwhile cleanup as a separate BB task, stay focused on the current work, and ignore minor style nits. The plugin does not create tasks itself.
- Provide project-specific enablement and prompt overrides through plugin-owned configuration, with a default that uses the installed `bb task-board` command rather than OpenForge CLI commands.
- Test scope, prompt delivery, configuration persistence, reload/disable behavior, and verify the installed plugin against live BB sessions.
- Document that BB's plugin enable switch is global, not OpenForge-style per-project enablement, and that running provider sessions keep instructions until reconstructed.

## Capabilities

### New Capabilities

- `code-cleanup-guidance`: Project-selected, lifecycle-safe agent instructions for judging and recording adjacent cleanup as follow-up BB tasks.

### Modified Capabilities

None.

## Impact

A new `bb-plugin-code-cleanup/` package will use the installed BB Plugin SDK's agent-configuration, CLI, and plugin storage APIs. It will instruct agents to use the existing `bb task-board` CLI when that plugin is available, without modifying the task-board plugin or existing project instructions. Its live check will use fresh BB agent sessions; unrelated work already present in this checkout stays untouched.
