# Spec Delta

## Purpose

Provide an optional, light Liquid Glass-inspired BB appearance with shiny translucent controls while preserving readable working content and normal app behavior.

## ADDED Requirements

### Requirement: Selectable and reversible appearance
The plugin SHALL expose a Liquid Glass theme through BB's existing theme selection. Installing the plugin SHALL NOT automatically select the theme or change the user's light/dark preference. Switching away, disabling, or removing the plugin SHALL remove its visual effects without changing thread data. BB 0.43.4 clients MAY require a page reload after theme changes, including CLI selection; the plugin SHALL document this accepted host limitation rather than introduce host synchronization code.

#### Scenario: Select the theme
- **WHEN** the installed plugin is enabled and the user selects Liquid Glass in Appearance or through the theme CLI
- **THEN** the theme is applied after reloading if needed and remains selected across reloads according to BB's existing selection behavior

#### Scenario: Leave the theme
- **WHEN** the user switches to another theme or disables the plugin
- **THEN** after reloading if needed, no glass wallpaper, highlights, or component overrides remain and BB displays the selected or default fallback theme

### Requirement: Pearly glass composition
In light mode, the theme SHALL display a static soft blue, pink, and lavender wallpaper behind the app. Sidebar, toolbar, composer, menus, and popovers SHALL have visibly rounded, translucent pearly backgrounds, bright rim highlights, and soft shadows. The supported rendering SHALL look shiny rather than merely recoloured.

#### Scenario: Main working view
- **WHEN** the user opens a thread in light mode with glass effects supported
- **THEN** the sidebar and composer appear as distinct glass panels over the pastel wallpaper while the toolbar shares their glass treatment

#### Scenario: Floating controls
- **WHEN** the user opens a menu or popover
- **THEN** it uses the same glass appearance without obscuring its labels or losing its existing placement and interaction behavior

### Requirement: Readable and usable content
The theme SHALL keep chat, code, diffs, and terminal text free of distortion and use backgrounds sufficient for body text contrast of at least 4.5:1. Decorative layers SHALL NOT intercept input, hide focus indicators, clip menus, or change scrolling behavior. Narrow layouts SHALL retain access to the composer and navigation.

#### Scenario: Work with content
- **WHEN** the user reads, selects, copies, or edits text and navigates controls by keyboard
- **THEN** text remains sharp, contrast remains sufficient over the brightest and darkest wallpaper regions, and input and focus work normally

#### Scenario: Narrow viewport
- **WHEN** BB uses its compact layout
- **THEN** the theme introduces no horizontal overflow or inaccessible controls

### Requirement: Graceful rendering fallbacks
The theme SHALL provide an opaque or sufficiently opaque fallback when backdrop filtering is unavailable or the browser exposes a reduced-transparency preference. Refraction SHALL be an optional enhancement confined to decoration, not required for usability. The wallpaper SHALL remain static and the plugin SHALL NOT require continuous animation. Dark mode SHALL remain readable without forcing a light-mode preference.

#### Scenario: Effects unavailable
- **WHEN** backdrop filtering or optional refraction is unsupported
- **THEN** panels retain readable labels, rounded highlights, and usable controls without missing backgrounds

#### Scenario: Reduced transparency
- **WHEN** the browser reports a request for reduced transparency
- **THEN** glass backgrounds become opaque and refraction and backdrop blur are disabled

#### Scenario: Existing dark preference
- **WHEN** the user selects Liquid Glass while BB is in dark mode
- **THEN** BB retains dark mode and presents compatible readable colours rather than light backgrounds with dark-mode text assumptions
