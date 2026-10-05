# liquid-glass-theme Specification

## Purpose

Provide an optional, light Liquid Glass-inspired BB appearance with shiny translucent controls while preserving readable working content and normal app behavior.

## Requirements

### Requirement: Retired theme is absent from the collection

The collection SHALL NOT distribute the Liquid Glass plugin package or advertise it as an available plugin. Archived changes and historical verification records SHALL remain intact as records of past behavior.

#### Scenario: Inspect the current collection

- **WHEN** a contributor examines the plugin directories and current installation documentation
- **THEN** the Liquid Glass package is absent and the current plugin list does not offer it for installation

#### Scenario: Consult historical records

- **WHEN** a contributor reads archived changes or historical verification records
- **THEN** existing Liquid Glass history remains available without implying current support

### Requirement: Local retirement preserves unrelated state

Applying retirement to Koen's local BB installation SHALL leave Liquid Glass uninstalled and unavailable in the theme list. It SHALL preserve the selected non-glass theme, favicon color, client light/dark preference, other plugin registrations, and thread data. If Liquid Glass is selected, retirement SHALL select BB's built-in default before removing the plugin. If the plugin is already absent, retirement SHALL succeed without attempting to remove another plugin. A failed removal SHALL be reported as incomplete.

#### Scenario: Liquid Glass is installed but not selected

- **WHEN** retirement is applied with Liquid Glass installed and another theme selected
- **THEN** only Liquid Glass is uninstalled and the existing theme and unrelated state are preserved

#### Scenario: Liquid Glass is selected

- **WHEN** retirement is applied while the selected theme belongs to Liquid Glass
- **THEN** BB's built-in default is selected before removal, Liquid Glass is uninstalled, and unrelated state is preserved

#### Scenario: Liquid Glass is already absent

- **WHEN** retirement is applied with no installed Liquid Glass plugin and a non-glass theme selected
- **THEN** absence is verified and the installation and appearance remain unchanged

#### Scenario: Removal fails

- **WHEN** BB reports a failed uninstall or still lists Liquid Glass after removal
- **THEN** retirement is reported as incomplete rather than claiming local removal succeeded
