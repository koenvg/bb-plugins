# Spec Delta

## MODIFIED Requirements

### Requirement: Action progress and result
While a merge or enqueue runs for a thread in a window, every visible merge action button for that thread SHALL show the same busy state and SHALL be disabled. The busy label SHALL be "Merging…" for a merge and "Enqueuing…" for enqueue. An action button mounted during that operation SHALL immediately show the same busy state. Requests from the tab, composer banner, and palette during the same running operation SHALL cause at most one GitHub write. On success, the plugin SHALL refresh PR insight so the tab and banner show the new state. On failure, the tab and banner SHALL show the operation error and make a still-valid action available again. Operation state SHALL NOT appear in another thread. An error for an earlier head commit SHALL NOT appear as the error for a newly loaded head commit.

#### Scenario: Merge succeeds
- **WHEN** GitHub merges the PR
- **THEN** the tab and banner refresh and show the merged state with no merge action button

#### Scenario: Enqueue succeeds
- **WHEN** GitHub adds the PR to the merge queue
- **THEN** the tab and banner refresh and show "Queued"

#### Scenario: GitHub rejects the action
- **WHEN** GitHub rejects the merge because the user has no write access
- **THEN** the tab and banner show the GitHub error and any still-valid merge buttons are available again

#### Scenario: Double click
- **WHEN** the user clicks "Enqueue" twice quickly
- **THEN** the plugin sends one enqueue request

#### Scenario: Merge starts in the tab
- **WHEN** the user confirms a merge in the PR tab while the composer banner is visible
- **THEN** both buttons show "Merging…" and are disabled until the operation ends

#### Scenario: Enqueue starts in the banner
- **WHEN** the user clicks "Enqueue" in the composer banner while the PR tab is visible
- **THEN** both buttons show "Enqueuing…" and are disabled until the operation ends

#### Scenario: Requests from different entry points
- **WHEN** an action from the tab and an action from the banner or palette overlap for the same thread
- **THEN** the plugin sends at most one GitHub write for the active operation

#### Scenario: PR tab opens during a merge
- **WHEN** a merge is running from the banner and the user explicitly opens the PR tab
- **THEN** the tab's merge button immediately shows "Merging…" and is disabled

#### Scenario: A new head commit loads
- **WHEN** a failed merge was for head commit A and a later load shows head commit B
- **THEN** the error for A does not appear as the merge error for B

### Requirement: Merge action in the composer banner
The composer banner of a thread SHALL show the same merge action as the PR tab, with the same merge method, confirm step, head commit guard, shared progress, and result. A ready PR SHALL show "Ready to merge" or "Ready to enqueue" and the button when idle. While an operation runs, the banner SHALL show "Merging…" or "Enqueuing…" instead of a ready message, including when the action started from the tab or palette. A queued PR SHALL show "Queued" and no button. A merged PR SHALL show "Pull request merged" with a violet merge icon and no merge action. A closed PR SHALL show no normal PR banner. Other PRs with blockers SHALL show the blocker banner as before. Palette preparation SHALL show a loading message in the banner. Palette errors or unavailable-action messages SHALL remain visible in the banner even if its normal PR state would hide it, until dismissed, replaced by a later attempt, or superseded by current PR data. Clicking the normal PR banner text SHALL open the PR tab. No operation or error SHALL automatically open the panel.

#### Scenario: Ready PR in the chat view
- **WHEN** the thread's PR has no blockers and its repository has no merge queue
- **THEN** the composer banner shows "Ready to merge" and a "Squash and merge" button for a squash default

#### Scenario: Merge from the banner
- **WHEN** the user clicks the merge button in the banner and confirms the dialog
- **THEN** the plugin merges the PR and, after the refreshed insight arrives, the banner shows "Pull request merged" without a merge action

#### Scenario: Queued PR in the chat view
- **WHEN** the thread's PR is in the merge queue
- **THEN** the composer banner shows "Queued" and no button

#### Scenario: PR with blockers in the chat view
- **WHEN** the thread's PR has the blocker "1 check failed"
- **THEN** the composer banner shows the blocker text as before and no merge button

#### Scenario: Open the PR tab from the banner
- **WHEN** the user clicks the "Ready to merge" text
- **THEN** the PR tab opens and no GitHub write occurs

#### Scenario: Merged PR in the chat view
- **WHEN** the thread's PR is merged
- **THEN** the composer banner shows "Pull request merged" with a violet merge icon and no merge action
- **AND** clicking the banner opens the PR tab without a GitHub write

#### Scenario: Palette merge progress
- **WHEN** the user confirms a palette merge with the PR tab closed
- **THEN** the banner shows "Merging…", disables its merge action, and does not open the side panel

#### Scenario: Palette preparation
- **WHEN** the user runs "GitHub: Merge PR" and the new PR load is pending
- **THEN** the banner shows a loading message without opening the side panel

#### Scenario: Hidden normal banner with palette feedback
- **WHEN** a palette merge attempt finds no PR or a closed PR
- **THEN** the banner shows the reason without a merge button or an automatic panel opening
