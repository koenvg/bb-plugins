# plugin-verification Specification

## Purpose

Provide a reusable workflow for verifying changed BB plugins in their installed runtime, with observable evidence and explicit protection for the user's existing installation and data.

## Requirements

### Requirement: Resolve the verification target and expected behavior

The verification skill SHALL identify the plugin package, source checkout, change scope, target BB instance, and relevant project or host before installation. It SHALL derive required checks from the requested behavior, changed files, plugin documentation, and applicable acceptance scenarios. Each required behavior SHALL have an observable expected result. Material ambiguity SHALL be resolved with the user rather than by selecting an arbitrary plugin or comparison base.

#### Scenario: Multiple plugins are plausible targets

- **WHEN** a verification request does not identify a plugin and the changes affect multiple plugin packages
- **THEN** the skill asks which package or packages to verify before installing anything

#### Scenario: Verifying a committed change

- **WHEN** the working tree is clean but the request identifies a commit, branch comparison, or OpenSpec change
- **THEN** the skill uses that scope to derive checks instead of concluding that there is nothing to verify

### Requirement: Run applicable local checks without repairing the source

The skill SHALL discover and run the package's applicable local checks and build before live installation. It SHALL distinguish an absent check from a passing check and retain failure or prerequisite evidence. A failed required check SHALL stop installation by default. Verification SHALL NOT silently modify plugin source, tests, dependency declarations, lockfiles, SDK pins, or acceptance criteria to make a check pass.

#### Scenario: Build failure

- **WHEN** the changed plugin fails to build
- **THEN** the build is reported as failed, dependent live checks remain blocked, and the current installation is left untouched

#### Scenario: Package has no test command

- **WHEN** the package does not declare an applicable automated test command
- **THEN** the report states that automated test coverage is unavailable and continues with the other applicable checks without claiming that tests passed

### Requirement: Safely activate and identify the changed installation

The skill SHALL use the current BB instance by default and record the target plugin's original source, enabled state, and runtime status. It SHALL ask for explicit approval before changing an existing plugin's source, enabling a previously disabled plugin, replacing a competing plugin, or taking a destructive action. Approval SHALL describe the affected state and intended final installation. Installation or reload SHALL target only the selected plugin. Before claiming a live check passed, the skill SHALL establish that the observed runtime belongs to the changed checkout rather than an older installation.

#### Scenario: Existing source is another worktree

- **WHEN** the installed plugin points to a different local directory
- **THEN** the skill shows the old and proposed source paths and waits for approval before switching them

#### Scenario: Managed installation cannot be replaced safely

- **WHEN** testing the local checkout would require removing a managed installation and deleting its settings, secrets, or schedules
- **THEN** the skill explains the loss and blocks replacement until the user explicitly approves that destructive operation or provides another target

#### Scenario: Reload preserves the previous working instance

- **WHEN** activation of the changed code fails and BB keeps an older instance running
- **THEN** the skill reports activation failure and does not use the older instance as evidence that the change works

### Requirement: Exercise browser behavior in a dedicated Chrome session

For browser-visible changes, the skill SHALL use a dedicated local Chrome-family session instead of Arc. It SHALL navigate to the affected BB UI and perform actions that demonstrate the expected behavior, including refresh or persistence checks when relevant. Opening a page or observing an installed-plugin status alone SHALL NOT satisfy a behavioral check. A separate browser session SHALL NOT be treated as a separate BB server or database.

#### Scenario: Changed setting persists

- **WHEN** the change promises that a setting survives page reload
- **THEN** the skill changes the setting through the intended interface, reloads the page, and compares the resulting state with the expected value

#### Scenario: Browser session cannot authenticate

- **WHEN** the dedicated session cannot reach the required authenticated BB page
- **THEN** browser checks are reported as blocked and the skill asks for the needed access without switching to Arc or copying credentials from a personal profile

### Requirement: Cover each affected runtime behavior

The skill SHALL select checks by the plugin's actual behavior rather than assume that every plugin has a standalone page. Browser checks SHALL cover affected themes, sidebar replacements, settings, and other contributed UI. CLI, backend, or host behavior SHALL receive appropriate installed-runtime checks. When browser interaction is not applicable, the report SHALL explain why and identify the evidence used instead.

#### Scenario: Theme has no frontend application entry

- **WHEN** a plugin contributes a theme without a frontend application bundle
- **THEN** verification still checks the selected theme in the browser and does not classify the plugin as having no UI

#### Scenario: Backend-only change

- **WHEN** a plugin change affects only a CLI or backend operation
- **THEN** the skill exercises that installed operation and reports that a browser check is not applicable to the changed behavior

### Requirement: Protect user data and credentials

The skill SHALL use read-only observations or bounded test records for verification. Before running actions that delete existing data, start agents, send external messages, publish changes, consume paid resources, or change unrelated user state, it SHALL obtain approval for the specific action. Test setup and cleanup SHALL have a defined ownership and restoration scope. Evidence SHALL exclude secrets and unrelated private content. The skill SHALL NOT fabricate a passing live result by replacing application responses or injecting test results into the page.

#### Scenario: Check would start a thread

- **WHEN** a plugin workflow starts an agent thread as part of its normal action
- **THEN** the skill asks for permission to start that bounded test thread before activating the action, and records a blocked check if permission is unavailable

#### Scenario: Live prerequisite is missing

- **WHEN** a PR badge check requires a linked pull request but none is available
- **THEN** the live badge check remains blocked even if a separate fixture test passes

### Requirement: Report evidence and coverage honestly

Every required check SHALL receive a passed, failed, or blocked result with its expected behavior, observation, and relevant evidence. The report SHALL identify the plugin, checkout and change scope, BB target, actual browser, commands, live actions, and limitations. It SHALL distinguish product failures from missing prerequisites. Overall verification SHALL be failed if any required check fails, blocked if none fail but a required check remains blocked, and passed only when all required checks pass and cleanup completes. Non-applicable checks SHALL be explained separately rather than counted as passes.

#### Scenario: Local checks pass but live data is unavailable

- **WHEN** tests and build pass but a required installed behavior cannot be exercised with available data
- **THEN** the report shows the local passes, the blocked live check, and an overall blocked result

#### Scenario: Runtime error contradicts a screenshot

- **WHEN** the UI renders but the changed interaction produces an error in the plugin runtime
- **THEN** the skill reports that interaction as failed and includes the relevant error evidence rather than treating the screenshot as proof of success

### Requirement: Restore temporary state and disclose the final setup

The skill SHALL track temporary settings, owned test data, installation changes, browser sessions, and processes created during verification. On success or failure it SHALL attempt the approved cleanup, avoid overwriting concurrent user changes, and report anything it could not restore. It SHALL close only its own browser session and resources. It SHALL state the plugin source and enabled state left behind; uninstalling a plugin SHALL NOT be used as an automatic cleanup shortcut. Pending cleanup SHALL prevent an overall passed result.

#### Scenario: Temporary sidebar selection is restored

- **WHEN** verification temporarily selects a plugin sidebar and no other actor changes that selection
- **THEN** cleanup restores the previous sidebar and confirms the original selection is active

#### Scenario: User changes a setting during verification

- **WHEN** a setting no longer matches the temporary value written by verification
- **THEN** cleanup leaves that setting untouched, reports the conflict, and asks how to resolve it instead of overwriting the user's newer value

#### Scenario: Verification fails after opening the browser

- **WHEN** a required interaction fails after the skill created a browser session and approved test data
- **THEN** the skill still attempts its scoped cleanup and reports the failure, cleanup outcome, and remaining installation
