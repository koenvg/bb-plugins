# Spec Delta

## Purpose

Provide an independently installable Pi provider with subagent visibility and background activity support, without replacing BB's bundled provider or changing standalone Pi.

## ADDED Requirements

### Requirement: Independent provider installation

The plugin SHALL install as a separate package using published dependencies and its own committed lockfile. It SHALL NOT require an upstream BB checkout, private workspace packages, or a modified BB application. It SHALL preserve upstream license attribution and declare the BB, SDK, Pi, and subagent versions needed for its supported behavior.

#### Scenario: Install outside the upstream monorepo

- **WHEN** the plugin is built and installed from a clean standalone package checkout with its declared dependencies
- **THEN** its server, host bridge, and frontend load without access to sibling BB source packages

#### Scenario: Required runtime version is unsupported

- **WHEN** the host does not meet a declared compatibility prerequisite
- **THEN** the plugin reports the unmet prerequisite rather than claiming supported subagent behavior

### Requirement: Separate provider identity and safe coexistence

The plugin SHALL register provider ID `pi-subagents` with display name "Pi with subagents" and a plugin identity distinct from bundled plugin IDs. Installing it SHALL NOT disable the bundled Pi provider, change the default provider, migrate existing threads, or reuse the bundled provider's session storage.

#### Scenario: Bundled Pi is already available

- **WHEN** the new plugin is installed alongside the bundled Pi provider
- **THEN** both providers remain selectable and existing bundled-provider threads retain their identity and session data

#### Scenario: User selects the fork

- **WHEN** a user starts a new thread with "Pi with subagents"
- **THEN** that thread uses the fork while unrelated threads and provider settings remain unchanged

### Requirement: Preserve normal Pi provider behavior

The fork SHALL preserve normal Pi prompting, native tools, model and reasoning selection, native skill discovery, extension dialogs, checkpoint forks, and manual compaction within its declared compatibility range. It SHALL NOT load or enable the subagent package solely to make the new view available.

#### Scenario: Subagents are not installed or enabled

- **WHEN** a user runs ordinary Pi work through the fork without a compatible subagent package
- **THEN** ordinary Pi work remains available and the subagent view reports that observation support is unavailable

#### Scenario: An unrelated extension requests a dialog

- **WHEN** a Pi extension asks the user to select, confirm, input, or edit through supported RPC dialog behavior
- **THEN** the fork presents the dialog and returns the user's answer without routing it as subagent status

### Requirement: Standalone Pi remains unchanged

The plugin SHALL NOT modify global or project Pi settings, agent definitions, prompts, subagent configuration, or package installation as an installation or observation side effect. Its integration SHALL be limited to sessions started by the fork provider.

#### Scenario: User starts Pi outside BB

- **WHEN** the user starts standalone Pi after installing the fork
- **THEN** Pi retains its existing subagent execution and display configuration without requiring BB

#### Scenario: User returns to the bundled provider

- **WHEN** the user selects the bundled Pi provider for new work
- **THEN** that work does not depend on the fork's observation integration or require deletion of fork-provider history
