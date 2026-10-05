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

The thread menu and command palette SHALL NOT offer snooze for an archived selected thread, or when the selected thread or any included descendant waits for an approval or an answer, has an unread error, or has a queued message that failed to send. A running member without a blocking attention signal SHALL NOT block snooze.

#### Scenario: Thread waits for an approval

- **WHEN** the user opens the menu of a thread that waits for an approval
- **THEN** the menu shows no Snooze section

#### Scenario: Descendant waits for an answer

- **WHEN** an otherwise eligible parent has a grandchild that waits for an answer
- **THEN** the parent's menu shows no Snooze section and its snooze commands are unavailable

#### Scenario: Running child

- **WHEN** an otherwise eligible parent has a running child with no blocking attention signal
- **THEN** snooze remains available for the parent subtree

### Requirement: Snooze marks the thread read

Snoozing a selected subtree SHALL mark every included member read. A thread that runs SHALL be snoozable, and snoozing SHALL NOT stop any member's running work.

#### Scenario: Snooze an unread thread

- **WHEN** the user snoozes a thread with unread output
- **THEN** the thread is read and snoozed

#### Scenario: Snooze a running thread

- **WHEN** the user snoozes a thread that runs
- **THEN** the thread is snoozed and keeps running

#### Scenario: Unread children

- **WHEN** the user snoozes a parent with unread children and an unread grandchild
- **THEN** every included thread is read and snoozed

### Requirement: Snoozes are shared across clients

The snooze state, shared wake time, and snooze-group membership SHALL be stored on the BB server and SHALL be the same on all clients. A subtree snooze or a group wake on one client SHALL show on the other open clients without a reload. Group membership SHALL survive a server restart.

#### Scenario: Snooze on desktop

- **WHEN** the user snoozes a thread on the desktop app and then opens BB on the phone
- **THEN** the phone shows the thread as snoozed

#### Scenario: Parent snoozed on another client

- **WHEN** one client snoozes a parent and its descendants while another client has the list open
- **THEN** the other client moves every included member into Snoozed with the shared wake time

#### Scenario: Group survives restart

- **WHEN** the server restarts after a parent subtree is snoozed and then a child fails
- **THEN** the whole stored snooze group wakes

### Requirement: Snoozed group in All

In All, every snoozed thread SHALL show in a Snoozed group below all other groups. A pinned thread that is snoozed SHALL show in the Snoozed group. Members of a snoozed subtree SHALL retain their nesting and SHALL NOT also show in their ordinary groups or as context rows in an attention tab when their whole subtree is snoozed. The Snoozed group SHALL not show when no thread is snoozed. A snoozed thread SHALL show outside the Snoozed group only as a dimmed context row in the tree of an awake thread outside its snooze group, and SHALL NOT move that awake tree.

#### Scenario: Snoozed thread in All

- **WHEN** a thread is snoozed and the All tab is selected
- **THEN** the thread shows in the Snoozed group at the bottom, and not under its project group

#### Scenario: Pinned thread snoozed

- **WHEN** a pinned thread is snoozed
- **THEN** it shows in the Snoozed group and not in the Pinned group

#### Scenario: Whole parent subtree snoozed

- **WHEN** a parent and its existing children are snoozed together and All is selected
- **THEN** the parent and children appear once in Snoozed, nested beneath their parents

#### Scenario: Snoozed parent of an awake child

- **WHEN** a child created after its parent's snooze has unread output and Needs attention is selected
- **THEN** the parent shows as a dimmed context row above that child, and the parent's snooze group remains in Snoozed in All

#### Scenario: No snoozed threads

- **WHEN** no thread is snoozed
- **THEN** All shows no Snoozed group

### Requirement: Snoozed row shows its wake time

A snoozed row with no live state SHALL show its wake time in place of its age, as a short weekday and a time, for example "Tue 9:00". The full wake date and time SHALL be available as the row time tooltip.

#### Scenario: Idle snoozed thread

- **WHEN** an idle thread is snoozed until Tuesday 9:00
- **THEN** its row shows "Tue 9:00" where the age shows on other rows

### Requirement: Wake now

The thread menu SHALL show Wake now for a snoozed thread. Wake now on any snooze-group member SHALL end the snooze for the whole group at once. The awakened threads SHALL move through the existing tree-tab rules. Wake now SHALL NOT mark any group member unread and SHALL NOT end unrelated snoozes.

#### Scenario: User wakes a thread early

- **WHEN** the user selects Wake now on a snoozed, idle thread with no PR
- **THEN** the snooze ends and the thread shows in Needs attention

#### Scenario: Wake from a child

- **WHEN** the user selects Wake now on a child snoozed with its parent and siblings
- **THEN** the whole snooze group wakes without changing any member's read state

#### Scenario: Unrelated snooze remains

- **WHEN** one snooze group is manually woken while another group remains snoozed
- **THEN** only the selected member's group wakes

### Requirement: Wake at the set time

When the shared wake time passes, the snooze SHALL end for every member of the group, and each remaining, non-archived member SHALL be marked unread, within one minute. This SHALL happen when no client is open. When the server was down at the wake time, the group snooze SHALL end, and its remaining, non-archived members SHALL be marked unread, within one minute after the plugin starts again. A failed unread update for a deleted member SHALL NOT prevent the remaining members from waking. A deadline operation for an older snooze SHALL NOT remove a newer snooze created while the operation runs.

#### Scenario: Wake time passes

- **WHEN** a thread is snoozed until 9:00 and the time is 9:00
- **THEN** by 9:01 the thread is not snoozed, is unread, and shows in Needs attention

#### Scenario: Server was off

- **WHEN** the wake time passes while the BB server is off and the server starts later
- **THEN** within one minute of the start the group is not snoozed and its remaining, non-archived members are unread

#### Scenario: Subtree deadline with no clients

- **WHEN** a parent subtree's wake time passes while no client is open
- **THEN** within one minute every remaining, non-archived member is awake and unread

#### Scenario: Member deleted before deadline

- **WHEN** a snoozed child was deleted before its group's deadline
- **THEN** the deleted member's stale snooze is cleared and the remaining members wake normally

#### Scenario: Snooze replaced during deadline processing

- **WHEN** a due group is replaced with a later snooze while its deadline operation runs
- **THEN** the newer snooze remains stored

### Requirement: Early wake on thread signals

A snooze group SHALL wake before its wake time when any member waits for an approval or an answer, has an unread error, has a queued message that failed to send, fails, or completes a run. An early wake SHALL end the snooze for every member, and the awakened tree SHALL move through the existing tab rules. The wake operation SHALL NOT manufacture unread output on members that did not produce it. Approval, answer, unread-error, and queued-send signals SHALL be acted on when observed by an open plugin frontend; run completion and failure SHALL wake the group through server events even with no client open. A signal from a thread outside the group SHALL NOT wake the group.

#### Scenario: Snoozed thread asks a question

- **WHEN** a snoozed thread that runs starts to wait for an answer and an open frontend observes it
- **THEN** its whole group wakes and the awakened tree shows in Needs attention

#### Scenario: Snoozed thread completes

- **WHEN** a snoozed thread that runs becomes idle with new output
- **THEN** its whole group wakes and the awakened tree shows in Needs attention with that thread unread

#### Scenario: Snoozed thread fails

- **WHEN** a snoozed thread that runs fails
- **THEN** its whole group wakes and the awakened tree shows in Needs attention

#### Scenario: Grandchild waits for approval

- **WHEN** an open frontend observes a grandchild in a snoozed parent group waiting for approval
- **THEN** the parent, its grouped children, and the grandchild all wake together

#### Scenario: Child completes with no client open

- **WHEN** a grouped child completes a run while no client is open
- **THEN** the server ends the snooze for that child's whole group

#### Scenario: Child outside the group needs the user

- **WHEN** a child created after its parent's snooze starts to wait for approval
- **THEN** the child shows in Needs attention without ending the parent's existing snooze group

### Requirement: Archive ends a snooze

Archiving a snoozed thread SHALL end that thread's snooze and remove it from its snooze group. This SHALL NOT archive or wake the other group members. Unarchiving the thread SHALL NOT restore its snooze. Remaining members SHALL still wake together at their shared deadline or on an early-wake signal.

#### Scenario: Archive and unarchive

- **WHEN** the user archives a snoozed thread and then unarchives it
- **THEN** the thread is not snoozed

#### Scenario: Archive one group member

- **WHEN** the user archives a child in a snoozed parent group
- **THEN** the child's snooze ends, the parent and other members remain snoozed, and an unarchive does not restore the child's membership

### Requirement: Snooze applies to the selected subtree

Snoozing a thread SHALL snooze that thread and its existing active, non-hidden descendants at every depth as one snooze group with the selected wake time. Selecting a child SHALL NOT snooze its ancestors or siblings. Collapsed rows, offscreen rows, project boundaries, and the selected tab SHALL NOT change membership. Archived and hidden threads SHALL NOT be snoozed or marked read by this action. Membership SHALL be captured at the action; children created later SHALL NOT automatically join. If some selected descendants are already snoozed, the new parent snooze SHALL replace their snoozes with the new group's wake time.

#### Scenario: Parent has children and a grandchild

- **WHEN** the user snoozes a parent until tomorrow at 9:00, with two active children and an active grandchild
- **THEN** all four threads belong to one snooze group until tomorrow at 9:00

#### Scenario: Select a child subtree

- **WHEN** the user snoozes a child with a grandchild and an awake sibling
- **THEN** the child and grandchild are snoozed together, and their parent and sibling remain awake

#### Scenario: Collapsed child in another project

- **WHEN** a parent is collapsed and has an offscreen child in a different project
- **THEN** snoozing the parent includes the child

#### Scenario: Archived or hidden descendant

- **WHEN** a parent has archived or hidden descendants and the user snoozes the parent
- **THEN** those archived and hidden threads retain their read state and receive no snooze

#### Scenario: Descendant already has a snooze

- **WHEN** a child is snoozed until next week and its awake parent is snoozed until tomorrow
- **THEN** the parent and its included descendants share one snooze group until tomorrow

#### Scenario: Child created after snooze

- **WHEN** a new child is created after the parent's snooze action
- **THEN** the new child is not a member of that snooze group and follows its own tab rules

#### Scenario: Snooze operation fails

- **WHEN** an included member cannot be marked read and the subtree snooze fails
- **THEN** no partial new snooze group is stored or published, and the initiating client reports the failure

### Requirement: Snooze entry points share subtree behavior

The sidebar menu and command palette SHALL use the same selected-subtree eligibility and snooze-group wake behavior. Execution SHALL recheck the latest observed subtree state, including blocking signals in descendants, before dispatch. Loading or failed required state SHALL NOT be treated as proof that the subtree is eligible.

#### Scenario: Snooze from the command palette

- **WHEN** the focused thread has children, the sidebar is closed, and the user invokes Threads: Snooze until tomorrow
- **THEN** the focused thread and its eligible descendants are snoozed as one group

#### Scenario: Child needs approval after palette opens

- **WHEN** a parent's snooze command was listed, but the latest observed child state now waits for approval before execution
- **THEN** the command does not snooze or mark read any member

### Requirement: PR changes do not wake a snooze group

A change in PR status SHALL NOT end a snooze group, whether it affects the selected parent or another member.

#### Scenario: Checks fail during snooze

- **WHEN** a snoozed, idle thread has a PR whose checks fail
- **THEN** its whole group stays snoozed

#### Scenario: Child PR changes

- **WHEN** only a grouped child's PR changes to requested changes
- **THEN** the parent and all group members remain snoozed
