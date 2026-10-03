# codex-inspired-theme Specification

## Purpose

Provide a repository-owned Codex Inspired theme that users can install on another laptop, while safely moving the existing local installation without changing its appearance.

## Requirements

### Requirement: Theme is available from the repository

The repository SHALL distribute Codex Inspired as a separate plugin with reproducible development dependencies and documented local and Git installation commands. It SHALL retain the plugin identity `codex-inspired`, theme identity `plugin:codex-inspired:codex-inspired`, and minimum compatibility of BB 0.44 and Plugin SDK 0.5.29. Its automated tests SHALL run in the existing repository CI without a BB installation or account credentials.

#### Scenario: Install on another laptop

- **WHEN** a user installs the theme package from a published repository revision on a compatible BB instance
- **THEN** Codex Inspired is available in Settings > Appearance without files from the original laptop

#### Scenario: Check a clean checkout

- **WHEN** the package's locked dependencies are installed in a clean checkout using the repository's supported Node version
- **THEN** its documented automated test command runs once and reports its result without local BB or credentials

### Requirement: Existing appearance is preserved

The repository theme SHALL preserve the approved light and dark stylesheet without changing its palette, typography, sidebar rules, chat text, or composer styling. It SHALL continue to use fonts supplied by the operating system and BB without downloading fonts. The migration SHALL NOT redesign code colors or introduce additional theme assets.

#### Scenario: Compare the moved theme

- **WHEN** the repository package is compared with the approved standalone theme
- **THEN** the stylesheet is byte-identical and the selected theme produces the same light and dark appearance on the same BB version

### Requirement: Theme activation remains optional

Installing or loading the plugin SHALL add a selectable theme without choosing it, injecting unconditional global styles, or changing Fonts settings, navigation, thread-list behavior, favicon color, or client light/dark preference. Codex Inspired SHALL remain independently usable without Compose Chat.

#### Scenario: Install while another theme is selected

- **WHEN** Codex Inspired is installed or loaded while another theme is selected
- **THEN** the selected theme and unrelated appearance settings remain unchanged until the user explicitly selects Codex Inspired

#### Scenario: Use without Compose Chat

- **WHEN** the user selects Codex Inspired with Compose Chat absent or disabled
- **THEN** the theme remains available and applies its existing stylesheet

### Requirement: Local source move preserves the installed selection

Moving the existing installation SHALL retain its plugin and theme identities, selected theme, enabled state, favicon color, Fonts settings, and client light/dark preferences. The move SHALL use a verified durable repository checkout rather than leave BB dependent on a disposable task worktree. It SHALL NOT uninstall the existing plugin as a migration shortcut.

#### Scenario: Move the active local theme

- **WHEN** the current standalone installation is replaced with the verified repository package
- **THEN** BB reports the new source path and the same active theme with identical resolved CSS, without resetting unrelated settings

#### Scenario: Replacement activation fails

- **WHEN** BB cannot load the repository copy or still reports the old source
- **THEN** the move is reported as incomplete, the standalone directory is retained, and the previous working source is retained or restored without changing appearance settings

### Requirement: Old directory is removed only after safe replacement

The move SHALL remove only `/Users/koen/workspace/bb-plugin-codex-inspired` after the replacement passes required package and installed-runtime checks and all necessary source and assets are preserved in the repository. It SHALL verify that the old directory is the inspected standalone package and has not gained changes or unknown files since inspection. A failed check, unexpected content, concurrent source change, or changed BB registration SHALL block deletion. Deletion failure SHALL be reported as incomplete cleanup rather than successful completion.

#### Scenario: Successful cleanup

- **WHEN** the repository copy passes all required checks, BB uses its durable path, and the old directory matches the inspected package
- **THEN** the standalone directory is removed and BB continues to resolve the repository-owned theme

#### Scenario: Standalone contents change

- **WHEN** the old package changes or has unaccounted files before deletion
- **THEN** deletion stops, those files remain intact, and the discrepancy is reported for resolution

#### Scenario: Verification is blocked

- **WHEN** a required package or live appearance check cannot complete
- **THEN** the old directory remains available and the migration is reported as blocked
