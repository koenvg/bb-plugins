# github-test-ci Specification

## Purpose

Give contributors automatic test results for every plugin on GitHub pull requests and changes to the main branch, without requiring a developer's local BB installation or credentials.

## Requirements

### Requirement: Automatic test checks on proposed and merged changes

The repository SHALL run its plugin test workflow when a pull request is opened, reopened, or updated, and when commits are pushed to `main`. The workflow SHALL test all seven current plugins without path-based exclusions.

#### Scenario: Pull request opened or updated
- **WHEN** a pull request is opened, reopened, or receives new commits
- **THEN** GitHub schedules test checks for Code Cleanup, Codex Quota, GitHub Insight, Liquid Glass, Threads with PRs, Tasks Plus, and Task Board

#### Scenario: Commit pushed to main
- **WHEN** a commit is pushed to `main`
- **THEN** GitHub schedules the same complete set of plugin test checks

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
- **WHEN** a plugin check starts with no restored dependency cache
- **THEN** it installs the locked dependencies and proceeds to run the tests

#### Scenario: Manifest and lockfile disagree
- **WHEN** a plugin's manifest requires dependencies inconsistent with its committed lockfile
- **THEN** dependency installation fails and the plugin check reports failure

### Requirement: Required test prerequisites are available

CI SHALL provide the external test tools needed by the existing suites. In particular, the Tasks Plus import test SHALL NOT skip because the SQLite CLI is absent, and a failed prerequisite setup SHALL fail the affected check.

#### Scenario: Tasks Plus import regression test
- **WHEN** the Tasks Plus suite runs in CI
- **THEN** the SQLite CLI is available and the bundled-data import regression test executes instead of taking its missing-SQLite skip path

### Requirement: Independent and truthful plugin results

GitHub SHALL display a separately identifiable result for each plugin. A failed dependency installation, prerequisite setup, or test command SHALL fail that plugin's check. Failure in one plugin SHALL NOT cancel the other plugins' checks within the same run.

#### Scenario: One plugin fails
- **WHEN** one plugin's test command exits unsuccessfully
- **THEN** its check reports failure and the other plugin checks remain eligible to finish and report their own results

### Requirement: Tests do not need privileged repository or account access

The workflow SHALL run with read-only repository permissions and without repository secrets, live account credentials, or an installed BB application. Fork pull requests SHALL use the normal unprivileged pull-request workflow, subject to GitHub's approval policies.

#### Scenario: Approved fork pull request
- **WHEN** GitHub permits a fork pull request's workflow to run without supplying repository secrets
- **THEN** the plugin checks can install dependencies and run their suites without BB installation, account sign-in, or elevated repository permissions
