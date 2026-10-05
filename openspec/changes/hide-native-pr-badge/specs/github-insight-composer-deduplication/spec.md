# Spec Delta

## Purpose

Avoid duplicate PR status above the composer while preserving GitHub Insight's banner and BB's other native controls.

## ADDED Requirements

### Requirement: Hide only duplicate native PR badges

The plugin SHALL hide the native PR badge in a thread composer displaying its custom PR banner, without hiding the custom banner, committed/changed-file controls, or native PR actions. This behavior SHALL hold at normal and compact widths.

#### Scenario: Custom banner visible

- **WHEN** a thread composer displays GitHub Insight's PR banner and BB's native PR badge
- **THEN** only the native PR badge is hidden
- **AND** the custom banner still opens the PR panel
- **AND** existing file controls and available merge or mark-ready actions remain visible and usable

#### Scenario: Compact composer

- **WHEN** that composer is shown at a compact width
- **THEN** the duplicate badge remains hidden without removing or blocking the other controls

### Requirement: Suppression follows the custom banner

The plugin SHALL leave native badges unchanged in composers without its custom banner and restore normal native rendering when the banner is removed or the plugin is disabled.

#### Scenario: Banner unavailable

- **WHEN** the custom banner is absent because insight is loading, unavailable, or has no banner content
- **THEN** the native PR badge is not suppressed

#### Scenario: Multiple thread panes

- **WHEN** one pane displays the custom banner and another does not
- **THEN** suppression applies only to the pane displaying the custom banner

#### Scenario: Plugin disabled

- **WHEN** GitHub Insight is disabled or its banner unmounts
- **THEN** the workaround no longer suppresses the native badge

### Requirement: Unrelated PR links are preserved

The workaround SHALL leave PR links outside the targeted composer unchanged and SHALL leave native UI visible when BB's DOM no longer matches its narrow target.

#### Scenario: Other PR links

- **WHEN** PR links appear in messages, sidebar entries, or panels
- **THEN** those links remain visible and usable

#### Scenario: Host markup changes

- **WHEN** the supported native badge structure cannot be identified
- **THEN** the workaround hides no broader container or unrelated control
