# Spec delta

## MODIFIED Requirements

### Requirement: Automatic test checks on proposed and merged changes

The repository SHALL run its plugin test workflow when a pull request is opened, reopened, or updated, and when commits are pushed to `main`. The workflow SHALL test every remaining plugin directory in the checkout without path-based exclusions. Retired Liquid Glass SHALL NOT receive a test job.

#### Scenario: Pull request opened or updated
- **WHEN** a pull request is opened, reopened, or receives new commits
- **THEN** GitHub schedules test checks for Code Cleanup, Codex Quota, GitHub Insight, Threads with PRs, and Tasks Plus, matching the remaining plugin directories in the checkout

#### Scenario: Commit pushed to main
- **WHEN** a commit is pushed to `main`
- **THEN** GitHub schedules the same complete set of remaining plugin test checks

#### Scenario: Liquid Glass is retired
- **WHEN** the workflow runs after Liquid Glass is removed from the checkout
- **THEN** no job attempts to install dependencies or execute tests from the deleted Liquid Glass directory
