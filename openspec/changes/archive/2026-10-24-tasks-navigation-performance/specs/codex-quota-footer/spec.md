# Spec Delta

## ADDED Requirements

### Requirement: Footer integration does not delay unrelated page changes

The quota footer integration SHALL ignore DOM changes outside its sidebar targets and their relevant lifecycle or visibility context. Task selection, description rendering, and activity updates alone SHALL NOT cause a quota-footer rescan or computed visibility check. A burst of relevant changes SHALL be coalesced rather than causing a check for every mutation. This optimization SHALL preserve late sidebar attachment, sidebar replacement, visibility fallback, tooltip description ownership, modal-menu behavior, navigation readiness, and complete disposal. It SHALL NOT add polling or hide normal quota navigation when the enhanced control is unavailable.

#### Scenario: Task detail changes without a sidebar change

- **WHEN** the user repeatedly selects tasks and their headings, descriptions, classes, or activity nodes change without a relevant sidebar or ancestor change
- **THEN** the footer remains usable
- **AND** those changes cause no footer reconciliation or computed visibility reads

#### Scenario: Sidebar appears or is replaced

- **WHEN** BB mounts a sidebar after the footer integration starts or replaces a mounted sidebar
- **THEN** one enhancement attaches to each unambiguous available quota control
- **AND** the detached sidebar has no retained enhancement

#### Scenario: Relevant visibility context changes

- **WHEN** the quota footer or an ancestor becomes hidden, inert, disabled, or visually unavailable through a relevant style or class change
- **THEN** the integration rechecks availability and restores normal quota navigation when required
- **AND** it does not override the user's own visibility choice

#### Scenario: Tooltip or context menu changes accessibility attributes

- **WHEN** BB updates the quota control's tooltip description or a modal context menu applies background accessibility isolation
- **THEN** the integration preserves the quota description token and the host's unrelated tokens
- **AND** accessibility isolation alone does not remove a still-available footer enhancement

#### Scenario: A relevant burst settles

- **WHEN** several related sidebar mutations occur in one update batch
- **THEN** the integration performs one settled reconciliation for that burst
- **AND** mutations from its own badge do not create a repeated reconciliation loop

#### Scenario: Dispose with reconciliation queued

- **WHEN** the plugin reloads or disables after a relevant change has queued work
- **THEN** no queued work reattaches its enhancement after disposal
- **AND** all observers, listeners, styles, and navigation suppression from that generation are removed
