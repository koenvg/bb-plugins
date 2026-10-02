# Proposal

## Why

Snooze and Wake now are available only in a thread's sidebar menu. Adding them to the command palette lets users act on the thread in view without finding its row, while hiding commands that cannot do anything.

## What Changes

- Add three direct plugin commands: "Threads: Snooze until tomorrow", "Threads: Snooze until next week", and "Threads: Wake now".
- Target the focused thread supplied by BB's command context, including the focused pane in a split view.
- Hide every command unless the current thread and snooze state are loaded and the action is applicable. Snooze requires a non-archived, non-snoozed thread that does not need user input; Wake now requires an active snooze.
- Hide Next week when it resolves to the same time as Tomorrow.
- Re-check applicability and calculate the wake time when a command runs. An action that has become inapplicable performs no mutation.
- Reuse the existing local-time presets, snooze storage, RPC methods, read marking, and wake behavior.
- Register commands without default shortcuts. Users can assign bindings in BB's Keyboard settings.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `thread-snooze`: Add command-palette access with context-aware visibility and execution guards, without changing existing sidebar or wake rules.

## Impact

- `bb-plugin-pr-thread-list/app.tsx` gains command registration and an app-wide state owner that is independent of the sidebar drawer's visibility.
- The snooze client module shares loaded state and controls between the sidebar menu and command callbacks, with explicit readiness and lifecycle cleanup.
- Add command registration, applicability, execution, and lifecycle tests alongside the existing snooze tests; document the commands in the plugin README.
- Use existing Plugin SDK command and app-overlay interfaces. No BB core change, new dependency, snooze database migration, or RPC contract change is planned.
- Assumed defaults are three direct entries rather than a picker, no default shortcuts, and commands available while the plugin frontend is enabled even if its sidebar is not mounted. Another sidebar provider will still not display this plugin's Snoozed group.
