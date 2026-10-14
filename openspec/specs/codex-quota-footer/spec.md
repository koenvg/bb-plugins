# codex-quota-footer Specification

## Purpose

Show Codex remaining allowance beside the lower sidebar's Settings and Debug controls, using an icon and percentage while preserving dashboard access and truthful quota status.

## Requirements

### Requirement: Icon and percentage in the sidebar footer

On a supported BB layout, the plugin SHALL provide one quota control in the lower sidebar footer alongside Settings and Debug. A fresh, idle observation SHALL appear as a battery icon followed by its remaining percentage, without a persistent "Codex", "Codex Quota", or "remaining" text label. The battery fill SHALL be proportional to the same remaining percentage. Pending, loading, stale, expired, unavailable, and missing-selection states SHALL show an unfilled battery outline, not a retained account's fill. The percentage SHALL be visible without hover or activation and SHALL NOT disappear when the control is hovered or focused.

#### Scenario: Fresh allowance at a glance

- **WHEN** the selected host has a fresh, idle summary of 72% remaining and the footer is available
- **THEN** the footer shows a battery filled to 72% followed by `72%`, with no persistent product-name label

#### Scenario: Branding outlives quota views

- **WHEN** all quota views unmount but a registered battery icon remains visible or mounts later
- **THEN** the icon shows an unfilled outline until a quota view returns and revalidates the observation, without starting icon-owned requests or timers

#### Scenario: Pointer and keyboard focus

- **WHEN** the user hovers or focuses the enhanced footer control
- **THEN** its icon and percentage remain visible and its purpose is available through an accessible name and tooltip

### Requirement: Dashboard navigation remains intact

Activating the footer control with a pointer, Enter, or Space SHALL open the existing quota dashboard without resetting the selected host. The dashboard SHALL retain its host selector, refresh control, window details, reset countdowns, banked-reset status, and official Codex Usage link. The normal upper quota entry SHALL be suppressed only while a working enhanced footer control is available in the same sidebar. The plugin SHALL NOT rewrite the user's persisted navigation or footer preferences.

#### Scenario: Open the existing dashboard

- **WHEN** the user activates the enhanced footer control from another BB page
- **THEN** the existing quota dashboard opens with the same host selection and the upper quota entry is not duplicated in that sidebar

#### Scenario: No quota data

- **WHEN** no host is selected or quota data is unavailable
- **THEN** the footer control still opens the dashboard so the user can select a host, refresh, or follow the official usage link

#### Scenario: Compact drawer activation

- **WHEN** the user activates the footer control from an open compact sidebar drawer
- **THEN** BB opens the quota dashboard and dismisses the drawer through its normal navigation behavior

### Requirement: Shared and truthful allowance status

The footer SHALL use the same selected host, binding general window, normalized observation, and freshness policy as the dashboard. Only a fresh, idle observation SHALL display a numeric percentage. Pending, loading, unavailable, missing-selection, and expired states SHALL use a nonnumeric placeholder; a retained stale observation SHALL show a compact stale indicator instead of a fresh-looking percentage. Accessible status details SHALL identify the selected host, binding window when known, freshness, and observation time when available. Moving the control SHALL NOT add a quota polling schedule or expose credentials, raw quota responses, or another host's data.

#### Scenario: Zero is a valid value

- **WHEN** a fresh, idle summary reports 0% or 100% remaining
- **THEN** the footer displays `0%` or `100%` respectively rather than treating either as missing

#### Scenario: Observation ages or refreshes

- **WHEN** a displayed observation becomes stale, expires, or enters a refresh
- **THEN** the footer stops showing a fresh numeric percentage according to the existing quota freshness rules, without requiring the dashboard to be open

#### Scenario: Host changes during a request

- **WHEN** the selected host changes while an earlier quota read is pending
- **THEN** the old host's result cannot appear in the footer or the new dashboard selection

#### Scenario: Footer and dashboard are both visible

- **WHEN** the dashboard opens while the footer is already mounted
- **THEN** both views agree on allowance and status, and concurrent reads for the same selection share the existing in-flight request

### Requirement: Readable desktop and compact layout

The icon and percentage SHALL remain readable in a normal desktop sidebar, a narrowed desktop sidebar, and the open sidebar drawer at a 375px viewport. The control SHALL accommodate `100%` without clipping or overlapping adjacent controls. It SHALL preserve keyboard focus indication and BB's touch target sizing. The plugin SHALL NOT force a closed sidebar to open or pin a quota control over page content.

#### Scenario: Maximum displayed percentage

- **WHEN** the footer displays `100%` in desktop or compact layout
- **THEN** the icon, percentage, Settings, and Debug remain readable and independently usable

#### Scenario: Sidebar is closed

- **WHEN** the user closes the sidebar or compact drawer
- **THEN** the quota customization does not leave a floating control over the page

### Requirement: Compatibility fallback preserves access

The change SHALL work without changes to BB core or the Plugin SDK. If the footer is absent, hidden by the user, incompatible, or loses its enhancement, the plugin SHALL stop suppressing normal quota navigation. It SHALL NOT hide unrelated entries, edit another plugin's control, or undo the user's own visibility preferences. A missing integration target SHALL NOT crash the dashboard or the rest of BB.

#### Scenario: Footer markup changes

- **WHEN** the plugin cannot safely identify or enhance its own footer control
- **THEN** normal quota navigation remains available according to the user's existing preferences and the dashboard continues to work

#### Scenario: Footer control is hidden or removed

- **WHEN** the enhanced footer control disappears or the user hides it
- **THEN** the plugin removes its suppression of the normal quota entry and does not force the footer item visible again

#### Scenario: Sidebar remounts

- **WHEN** BB replaces the sidebar during navigation or a responsive layout transition
- **THEN** the plugin attaches at most one enhancement to each current quota footer control and leaves no enhancement attached to a detached sidebar

### Requirement: Reload and disable clean up customization

Reloading, disabling, or unloading the plugin SHALL remove its added badge nodes, scoped styles, navigation suppression, observers, event listeners, timers, and navigation callbacks. Re-enabling it SHALL produce one working control without requiring a page reload. Cleanup SHALL preserve BB-owned elements and unrelated plugin state.

#### Scenario: Repeated reload

- **WHEN** the plugin reloads repeatedly while the sidebar is visible
- **THEN** each replacement has one working quota footer control and no duplicate badges, callbacks, or active observers from prior generations

#### Scenario: Disable the plugin

- **WHEN** the user disables the plugin
- **THEN** its customization and managed registrations disappear without damaging Settings, Debug, or other sidebar entries

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
