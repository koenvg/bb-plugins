# thread-snooze Specification

## Purpose

Lets the user put a thread away until a set time, so that it leaves the attention tabs and comes back as unread when the time comes or when the thread needs the user.

## Requirements

### Requirement: Snooze menu items
The thread menu SHALL show a Snooze section for an active thread that is not snoozed. The section SHALL have two items: Tomorrow, which wakes at 9:00 on the next calendar day in the client's local time, and Next week, which wakes at 9:00 on the next Monday in the client's local time. When both items give the same time, the menu SHALL show only Tomorrow. The menu SHALL NOT show the Snooze section for an archived thread.

#### Scenario: Snooze on a Wednesday
- **WHEN** the user opens the menu of an active thread on Wednesday 15:00
- **THEN** Tomorrow wakes it on Thursday 9:00 and Next week wakes it on next Monday 9:00

#### Scenario: Snooze on a Friday
- **WHEN** the user selects Tomorrow on Friday
- **THEN** the thread wakes on Saturday 9:00

#### Scenario: Snooze on a Monday
- **WHEN** the user selects Next week on Monday 8:00
- **THEN** the thread wakes on the Monday seven days later at 9:00

#### Scenario: Snooze on a Sunday
- **WHEN** the user opens the menu on Sunday
- **THEN** the menu shows Tomorrow and does not show Next week

### Requirement: Snooze is blocked when the thread needs the user
The thread menu SHALL NOT show the Snooze section for a thread that waits for an approval or an answer, has an unread error, or has a queued message that failed to send.

#### Scenario: Thread waits for an approval
- **WHEN** the user opens the menu of a thread that waits for an approval
- **THEN** the menu shows no Snooze section

### Requirement: Snooze marks the thread read
Snoozing a thread SHALL mark it read. A thread that runs SHALL be snoozable.

#### Scenario: Snooze an unread thread
- **WHEN** the user snoozes a thread with unread output
- **THEN** the thread is read and snoozed

#### Scenario: Snooze a running thread
- **WHEN** the user snoozes a thread that runs
- **THEN** the thread is snoozed and keeps running

### Requirement: Snoozes are shared across clients
The snooze state SHALL be stored on the BB server and SHALL be the same on all clients. A snooze or a wake on one client SHALL show on the other open clients without a reload.

#### Scenario: Snooze on desktop
- **WHEN** the user snoozes a thread on the desktop app and then opens BB on the phone
- **THEN** the phone shows the thread as snoozed

### Requirement: Snoozed group in All
In All, every snoozed thread SHALL show in a Snoozed group below all other groups, and SHALL NOT show in any other group. A pinned thread that is snoozed SHALL show in the Snoozed group. The Snoozed group SHALL not show when no thread is snoozed. Needs attention and In flight SHALL NOT show snoozed threads.

#### Scenario: Snoozed thread in All
- **WHEN** a thread is snoozed and the All tab is selected
- **THEN** the thread shows in the Snoozed group at the bottom, and not under its project group

#### Scenario: Pinned thread snoozed
- **WHEN** a pinned thread is snoozed
- **THEN** it shows in the Snoozed group and not in the Pinned group

#### Scenario: No snoozed threads
- **WHEN** no thread is snoozed
- **THEN** All shows no Snoozed group

### Requirement: Snoozed row shows its wake time
A snoozed row with no live state SHALL show its wake time in place of its age, as a short weekday and a time, for example "Tue 9:00". The full wake date and time SHALL be available as the row time tooltip.

#### Scenario: Idle snoozed thread
- **WHEN** an idle thread is snoozed until Tuesday 9:00
- **THEN** its row shows "Tue 9:00" where the age shows on other rows

### Requirement: Wake now
The thread menu SHALL show Wake now for a snoozed thread. Wake now SHALL end the snooze at once, and the thread SHALL move to the tab that its rules select. Wake now SHALL NOT mark the thread unread.

#### Scenario: User wakes a thread early
- **WHEN** the user selects Wake now on a snoozed, idle thread with no PR
- **THEN** the snooze ends and the thread shows in Needs attention

### Requirement: Wake at the set time
When the wake time passes, the snooze SHALL end and the thread SHALL be marked unread, within one minute. This SHALL happen when no client is open. When the server was down at the wake time, the snooze SHALL end, and the thread SHALL be marked unread, within one minute after the plugin starts again.

#### Scenario: Wake time passes
- **WHEN** a thread is snoozed until 9:00 and the time is 9:00
- **THEN** by 9:01 the thread is not snoozed, is unread, and shows in Needs attention

#### Scenario: Server was off
- **WHEN** the wake time passes while the BB server is off and the server starts later
- **THEN** within one minute of the start the thread is unread and not snoozed

### Requirement: Early wake on thread signals
A snoozed thread SHALL wake before its wake time when it waits for an approval or an answer, has an unread error, has a queued message that failed to send, fails, or completes a run. An early wake SHALL end the snooze. The thread SHALL then move to the tab that its rules select.

#### Scenario: Snoozed thread asks a question
- **WHEN** a snoozed thread that runs starts to wait for an answer
- **THEN** the snooze ends and the thread shows in Needs attention

#### Scenario: Snoozed thread completes
- **WHEN** a snoozed thread that runs becomes idle with new output
- **THEN** the snooze ends and the thread shows in Needs attention as unread

#### Scenario: Snoozed thread fails
- **WHEN** a snoozed thread that runs fails
- **THEN** the snooze ends and the thread shows in Needs attention

### Requirement: PR and child changes do not wake a thread
A change in PR status SHALL NOT end a snooze. A change in a child thread SHALL NOT end the snooze of its parent.

#### Scenario: Checks fail during snooze
- **WHEN** a snoozed, idle thread has a PR whose checks fail
- **THEN** the thread stays snoozed

#### Scenario: Child needs the user
- **WHEN** a snoozed parent has a child thread that starts to wait for an approval
- **THEN** the child shows in Needs attention and the parent stays snoozed

### Requirement: Archive ends a snooze
Archiving a snoozed thread SHALL end its snooze. Unarchiving the thread SHALL NOT restore the snooze.

#### Scenario: Archive and unarchive
- **WHEN** the user archives a snoozed thread and then unarchives it
- **THEN** the thread is not snoozed
