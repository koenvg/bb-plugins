# Thread snooze command palette delta

## ADDED Requirements

### Requirement: Snooze commands target the focused thread

The plugin SHALL register "Threads: Snooze until tomorrow", "Threads: Snooze until next week", and "Threads: Wake now" in BB's command palette. Each command SHALL act on the thread identified by BB's current command context, not a previously focused thread or a sidebar row. The commands SHALL NOT require the sidebar drawer to be open or the target row to be visible. They SHALL have no default keyboard shortcuts and SHALL remain available for user-assigned bindings through BB's Keyboard settings.

#### Scenario: Focused pane in a split view

- **WHEN** two threads are open in a split view and the user invokes a snooze command from the focused pane
- **THEN** that pane's thread is selected for snooze and its eligible captured subtree is snoozed; the other pane is unaffected unless it belongs to that subtree

#### Scenario: Sidebar drawer is closed

- **WHEN** the plugin frontend is enabled, its state is loaded, the sidebar drawer is closed, and the focused thread is eligible for snooze
- **THEN** the applicable snooze commands appear and can snooze that thread

#### Scenario: User assigns a shortcut

- **WHEN** the user opens BB's Keyboard settings
- **THEN** the three commands are listed without default bindings and can receive user-assigned shortcuts

### Requirement: Snooze commands appear only when applicable

At each command availability evaluation, the plugin SHALL hide both snooze commands unless a focused thread is known, its current state and snooze state are successfully loaded, the thread is active and non-hidden, the thread has no active snooze, and no included member of its selected subtree needs the user. Waiting for an approval or answer, an unread error, or a failed queued message in any included member SHALL block snoozing under the same rules as the sidebar menu. Running alone SHALL NOT block snoozing. Inapplicable commands SHALL be absent rather than displayed as disabled entries.

#### Scenario: Eligible idle thread

- **WHEN** a non-archived, non-snoozed idle thread with no blocking signal is focused and state is loaded
- **THEN** the applicable snooze commands appear

#### Scenario: Eligible running thread

- **WHEN** a running thread is focused, state is loaded, and it has no active snooze or blocking signal
- **THEN** the applicable snooze commands appear

#### Scenario: Thread needs the user

- **WHEN** the focused thread waits for an approval or answer, has an unread error, or has a failed queued message
- **THEN** neither snooze command appears

#### Scenario: Archived or snoozed thread

- **WHEN** the focused thread is archived or already has an active snooze
- **THEN** neither snooze command appears

### Requirement: Wake now appears only for an active snooze

At each command availability evaluation, "Threads: Wake now" SHALL appear only when a known, non-archived focused thread has an active snooze and its current thread and snooze state are successfully loaded. A snooze whose wake time has passed or whose stored group has a member with a signal that ends snoozing SHALL NOT count as active.

#### Scenario: Snoozed thread in view

- **WHEN** a focused thread has an active snooze and state is loaded
- **THEN** Wake now appears and neither snooze command appears

#### Scenario: Awake or expired thread

- **WHEN** the focused thread is awake or its recorded snooze has expired
- **THEN** Wake now does not appear

#### Scenario: Thread receives an early-wake signal

- **WHEN** a snoozed thread starts waiting for an answer or has another signal that ends its snooze
- **THEN** Wake now does not appear at the next availability evaluation

### Requirement: Snooze commands use the existing local-time presets

The snooze commands SHALL use the same wake times as the sidebar menu: Tomorrow at 9:00 on the next local calendar day, and Next week at 9:00 on the next local Monday. Next week SHALL be hidden when it gives the same wake time as Tomorrow. A command SHALL calculate its wake time from the client's local calendar when it runs, rather than reuse a time calculated when the palette opened.

#### Scenario: Sunday has one snooze command

- **WHEN** the user opens the palette for an eligible thread on Sunday
- **THEN** Snooze until tomorrow appears and Snooze until next week does not

#### Scenario: Command runs after midnight

- **WHEN** Tomorrow was listed before local midnight and the user invokes it after midnight
- **THEN** the wake time is 9:00 on the day after the invocation date

#### Scenario: Next week becomes a duplicate while the palette is open

- **WHEN** Next week was listed on Saturday and the user invokes it after the local date becomes Sunday
- **THEN** the command performs no snooze operation because Next week is no longer applicable

### Requirement: Command execution rechecks applicability

When a palette command or its user-assigned shortcut runs, the plugin SHALL re-evaluate that command's applicability against the invocation context, the latest available subtree attention and stored snooze-group state, and the current local date immediately before dispatching the operation. If it is no longer applicable, the command SHALL perform no snooze, wake, or read-state mutation.

#### Scenario: Approval arrives while the palette is open

- **WHEN** a snooze command was listed and the focused thread starts waiting for an approval before invocation
- **THEN** invoking the stale entry performs no snooze or read-state mutation

#### Scenario: Another client has already snoozed the thread

- **WHEN** a snooze command was listed and a shared-state update reports an active snooze before invocation
- **THEN** invoking the stale entry does not replace the existing snooze

#### Scenario: Thread disappears or is archived

- **WHEN** a command was listed and the focused thread disappears from the known state or becomes archived before invocation
- **THEN** invoking the stale entry performs no operation

#### Scenario: Wake completes before invocation

- **WHEN** Wake now was listed and a shared-state update reports that the thread has already woken before invocation
- **THEN** invoking the stale entry performs no wake operation

### Requirement: Snooze command state is shared and fails closed

The palette and sidebar SHALL use the same shared snooze state. At each availability evaluation, commands SHALL reflect successful updates from another client and changes in the focused thread. All three commands SHALL be hidden when there is no focused thread, the thread cannot be resolved, required state is loading or unavailable after a failed load, or the plugin frontend has stopped. Commands SHALL become eligible again after the required state successfully loads. Commands SHALL NOT perform mutations through state or callbacks retained from a stopped plugin frontend.

#### Scenario: No focused thread

- **WHEN** the palette opens on a surface without a focused thread
- **THEN** none of the three commands appears

#### Scenario: Snooze state has not loaded or fails to load

- **WHEN** a thread is focused but its required snooze state is loading or unavailable after a failed load
- **THEN** none of the three commands appears

#### Scenario: Successful recovery

- **WHEN** a failed state load is followed by a successful reload and the focused thread is eligible
- **THEN** the applicable commands appear at the next availability evaluation

#### Scenario: Another client changes the snooze

- **WHEN** another client snoozes or wakes the focused thread and the shared update reaches this client
- **THEN** the palette's next availability evaluation and the sidebar agree about which actions are applicable

#### Scenario: Frontend stops while an entry is retained

- **WHEN** the plugin frontend stops after a command was listed and a retained entry is invoked
- **THEN** the command performs no operation

### Requirement: Palette actions preserve existing snooze effects

Snoozing through the palette SHALL use the selected-subtree policy, mark every included member read, and preserve running work. Wake now through the palette on any member SHALL end that stored group's snooze without marking members unread. These actions SHALL update other clients and the plugin's sidebar using the shared-state behavior. Scheduled and signal-triggered wakes SHALL use the stored group policy specified by `snooze-thread-subtrees`.

#### Scenario: Snooze unread output through the palette

- **WHEN** the user invokes an applicable snooze command for a thread with unread output
- **THEN** the selected thread and its included descendants become read and snoozed together until the selected preset time

#### Scenario: Wake early through the palette

- **WHEN** the user invokes Wake now for a snoozed thread
- **THEN** its stored group's snooze ends without marking any member unread and the sidebar places it according to its normal tab rules
