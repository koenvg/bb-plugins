# github-test-ci Specification

## Purpose

Give contributors automatic test results for every plugin on GitHub pull requests and changes to the main branch, without requiring a developer's local BB installation or credentials.

## Requirements

### Requirement: Existing package typecheck commands run in CI

Each plugin SHALL expose `npm run typecheck`, and CI SHALL run that existing command from the plugin directory using its locked local compiler. CI SHALL honor the command's configured inputs and exit status without substituting tests, a build, or another checker. A missing script or compiler SHALL fail the plugin check rather than count as a pass or trigger an automatic tool download.

#### Scenario: Existing compiler command

- **WHEN** CI reaches typechecking after successful setup
- **THEN** it runs the plugin's `npm run typecheck` command and reports that command's outcome

#### Scenario: Compiler reports a real type error

- **WHEN** the configured compiler detects a type error and exits unsuccessfully
- **THEN** the plugin's combined check reports failure even if its tests pass

#### Scenario: Typecheck script is missing

- **WHEN** a matrix plugin has no typecheck script
- **THEN** its check fails and reports the missing command rather than skipping it as successful

#### Scenario: Compiler executable is missing

- **WHEN** the declared typecheck command cannot find its compiler after dependency installation
- **THEN** its check fails and preserves the tool failure without using a global or automatically downloaded replacement

#### Scenario: Existing compiler inputs are bounded

- **WHEN** a plugin's current compiler configuration does not include a regression test
- **THEN** CI runs the existing command without claiming that the omitted test was statically checked

### Requirement: Automatic test checks on proposed and merged changes

The repository SHALL run its plugin check workflow when a pull request is opened, reopened, or updated, and when commits are pushed to `main`. The workflow SHALL schedule tests and typechecks for every remaining plugin directory in the checkout without path-based exclusions. Retired Liquid Glass SHALL NOT receive a plugin check job.

#### Scenario: Pull request opened or updated

- **WHEN** a pull request is opened, reopened, or receives new commits
- **THEN** GitHub schedules a combined test and typecheck job for every remaining plugin directory in that checkout

#### Scenario: Commit pushed to main

- **WHEN** a commit is pushed to `main`
- **THEN** GitHub schedules the same complete set of combined plugin checks

#### Scenario: Liquid Glass is retired

- **WHEN** the workflow runs after Liquid Glass is removed from the checkout
- **THEN** no job attempts to install dependencies, execute tests, or run typecheck from the deleted Liquid Glass directory

### Requirement: Consistent local and CI test commands

Each plugin SHALL expose `npm test` as a non-watch command that runs its existing test suite. CI SHALL use that command from the corresponding plugin directory without changing the suite's existing test discovery or substituting a build or bundle check.

#### Scenario: Task Board test command

- **WHEN** a contributor runs `npm test` in `bb-task-board` after installing its dependencies
- **THEN** its existing configured test suite runs once and exits with the suite's result

#### Scenario: Existing plugin test command

- **WHEN** CI runs a plugin's `npm test` command
- **THEN** it executes that plugin's existing suite and honors the test runner's exit status

### Requirement: Fresh dependency installation is reproducible

Each plugin check SHALL install dependencies from its committed lockfile in a clean environment using a compatible runtime. An invalid manifest or lockfile SHALL fail the check rather than trigger lockfile regeneration or an unconstrained install. Dependency caching SHALL NOT be required for a successful run or replace lockfile-based installation.

#### Scenario: No dependency cache is available

- **WHEN** a plugin check starts with no restored dependency cache and required setup succeeds
- **THEN** it installs the locked dependencies and runs both tests and typecheck without needing a developer's preinstalled tools or node_modules

#### Scenario: Manifest and lockfile disagree

- **WHEN** a plugin's manifest requires dependencies inconsistent with its committed lockfile
- **THEN** dependency installation fails and the plugin check reports failure without running tests or typecheck

### Requirement: Required test prerequisites are available

CI SHALL provide the tools and dependency setup needed by the existing tests and typecheck commands. The Tasks Plus import test SHALL NOT skip because the SQLite CLI is absent. GitHub Insight SHALL have its sibling PR thread-list dependencies available. Failed required setup SHALL fail the affected plugin check and prevent both validation commands from running.

#### Scenario: Tasks Plus import regression test

- **WHEN** the Tasks Plus suite runs in CI
- **THEN** the SQLite CLI is available and the bundled-data import regression test executes instead of taking its missing-SQLite skip path

#### Scenario: GitHub Insight sibling dependencies

- **WHEN** GitHub Insight runs its tests and typecheck from a clean checkout
- **THEN** the sibling PR thread-list package has its locked dependencies installed before either command runs

#### Scenario: Required setup fails

- **WHEN** a plugin's runtime setup, dependency installation, or required prerequisite fails
- **THEN** that plugin's combined result fails and neither its test command nor its typecheck command runs

### Requirement: Independent and truthful plugin results

GitHub SHALL display one separately identifiable combined test and typecheck result per plugin. After required setup succeeds, tests SHALL run before typecheck, and a completed test failure SHALL NOT skip typecheck. A failed install, prerequisite, test, or typecheck SHALL fail that plugin's result without cancelling other plugins. Explicit run cancellation or a job timeout SHALL NOT be treated as success and need not execute unfinished commands.

#### Scenario: One plugin fails

- **WHEN** one plugin's test command exits unsuccessfully after successful setup
- **THEN** its typecheck still runs, its combined check reports failure, and the other plugin checks remain eligible to finish and report their own results

#### Scenario: Tests pass but typecheck fails

- **WHEN** a plugin's tests pass and its typecheck exits unsuccessfully
- **THEN** its single combined result reports failure and the other plugin checks remain eligible to finish

#### Scenario: Tests fail but typecheck passes

- **WHEN** a plugin's tests fail and its subsequent typecheck passes
- **THEN** both command outcomes remain visible and the combined result remains failed

#### Scenario: Both commands fail

- **WHEN** a plugin's tests and subsequent typecheck both exit unsuccessfully
- **THEN** both failures remain visible in the job and its single combined result reports failure

#### Scenario: Both commands pass

- **WHEN** required setup, tests, and typecheck succeed and no other required job step fails
- **THEN** the plugin's single combined result reports success

#### Scenario: Run is cancelled or times out

- **WHEN** a run is explicitly cancelled, superseded, or reaches its job timeout before both commands finish
- **THEN** unfinished commands are not required to run and the plugin result does not report success

### Requirement: Tests do not need privileged repository or account access

The workflow SHALL run with read-only repository permissions and without repository secrets, live account credentials, or an installed BB application. Fork pull requests SHALL use the normal unprivileged pull-request workflow, subject to GitHub's approval policies.

#### Scenario: Approved fork pull request

- **WHEN** GitHub permits a fork pull request's workflow to run without supplying repository secrets
- **THEN** the plugin checks can install dependencies and run both tests and typecheck without BB installation, account sign-in, or elevated repository permissions
