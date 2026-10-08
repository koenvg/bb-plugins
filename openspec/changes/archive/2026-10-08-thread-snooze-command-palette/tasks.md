# Tasks

## 1. Share ready snooze state across the frontend

- [x] 1.1 Add explicit snooze-load readiness without treating an unanswered request as an empty successful response; verify tests cover initial loading, initial failure, failed refresh, reconnect reload, successful empty results, and recovery without changing PR-summary loading behavior.
- [x] 1.2 Move snooze loading, realtime subscription, and early-wake ownership into one headless app-overlay module with a shared snapshot and controls interface; verify owner lifecycle tests cover one subscription owner, cleanup, remount, and delayed responses from an old generation.
- [x] 1.3 Make the sidebar consume the shared snooze controls instead of starting a second snooze reader; verify the existing sidebar snooze tests still pass and mounting both the overlay and list does not duplicate snooze loads or early-wake operations.

## 2. Add applicable-only commands

- [x] 2.1 Register the three stable command IDs and proposed titles without default shortcuts, using one applicability calculation backed by the existing snooze model; verify registration and availability tests cover idle and running threads, every attention blocker, archived and snoozed threads, active and expired snoozes, Sunday deduplication, unknown threads, and unavailable state.
- [x] 2.2 Guard command execution with the latest invocation context, shared state, and current local date before calling the existing snooze or wake controls; verify direct invocation tests cover newly blocking input, archive or deletion, another client's snooze or wake, owner cleanup, midnight rollover, and Saturday-to-Sunday rollover, with no mutation for inapplicable entries.
- [x] 2.3 Add command integration tests through the SDK app harness that verify the focused thread is targeted independently of sidebar row visibility, the commands work with only the app-wide owner mounted, successful mutations refresh shared state, and RPC failures show the snooze failure message without pretending success.
- [x] 2.4 Document the commands in `bb-plugin-pr-thread-list/README.md`, including focused-thread targeting, applicability rules, local-time presets, configurable shortcuts without defaults, and the Snoozed-group limitation with another sidebar provider; verify the documented labels match command registration.

## 3. Verify the combined behavior

- [x] 3.1 Run the plugin's full tests and typecheck, the installed CLI's read-only SDK compatibility check, and the plugin build; verify all required checks pass and no unexpected dependency, RPC, or persisted-schema changes were introduced.
- [x] 3.2 Verify the exact checkout's installed palette behavior for eligible, blocked, snoozed, and no-thread contexts, focused split panes, a closed sidebar, and user-assigned shortcut invocation; verify commands are absent rather than disabled when inapplicable and successful snooze/wake actions agree with the sidebar and a second client. Follow installation and test-state approval rules, and record unavailable prerequisites as blockers rather than passes.

Archive decision: the user requested closure of item 3.2 and archive of this change. The checkbox records that closure, not a new verification pass. Installed-host palette, shortcut, split-pane, and second-client checks were not run for this archive.
