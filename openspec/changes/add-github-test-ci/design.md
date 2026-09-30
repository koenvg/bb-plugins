# Design

## Context

See [proposal.md](proposal.md) for the motivation and scope. This change crosses all seven plugin packages, so the workflow needs explicit decisions about isolation, runtimes, and test prerequisites.

The repository has no root npm package or GitHub Actions workflow. Each plugin has its own manifest and lockfile. Six plugins expose `npm test`; Task Board has Vitest and a configuration but no scripts section. Liquid Glass uses Node's built-in test runner, while the others use several Vitest versions. There are 86 test files in the inspected checkout.

The locked GitHub Insight `jsdom` dependency requires Node 24.15 or later within the Node 24 line. Several packages use native `better-sqlite3`. Tasks Plus's `scripts/import-bundled-data.test.ts` skips if the `sqlite3` executable is unavailable and supplies its own fake `bb` command. Codex Quota's separate `test:bundle` command requires `bb plugin build`; its normal `npm test` command does not invoke that build.

## Goals / Non-Goals

**Goals:**
- Preserve each package's dependency boundary and current test discovery.
- Make CI failures attributable to a single plugin and reproducible with the same local command.
- Supply an explicit compatible runtime and external test prerequisites on clean runners.

**Non-Goals:**
- Introduce npm workspaces, a root test orchestrator, or a shared test-runner configuration.
- Change application behavior, regenerate plugin types, upgrade dependencies, or hide existing failures by excluding tests.
- Add operating-system or Node-version compatibility matrices beyond one Ubuntu and Node 24 configuration.

## Decisions

### One workflow with an explicit plugin matrix

Add `.github/workflows/tests.yml`, triggered by ordinary `pull_request` events and pushes to `main`, without path filters. Use one matrix test job with these directory values:

- `bb-plugin-code-cleanup`
- `bb-plugin-codex-quota`
- `bb-plugin-github-insight`
- `bb-plugin-liquid-glass`
- `bb-plugin-pr-thread-list`
- `bb-plugin-tasks-plus`
- `bb-task-board`

Name each job with its plugin directory, set `strategy.fail-fast: false`, and use a 20-minute job timeout. Cancel superseded runs for the same workflow and pull request or branch, without coupling unrelated branches or pull requests. Cancellation of superseded runs is separate from failure handling within a run.

A serial shell loop would use fewer simultaneous runners but delay results and make per-plugin failures harder to see. Runtime package discovery would add machinery for only seven known directories. The explicit matrix is simpler, but new plugins must be added deliberately.

### Preserve package-local installs and tests

Use `ubuntu-latest`, checkout the repository, and configure Node with `actions/setup-node` using the semver range `>=24.15.0 <25`. Use supported official action releases pinned to verified commit SHAs with version comments.

Configure the setup-node npm download cache using the matrix plugin's `package-lock.json`. Set the shell working directory to that plugin, then run `npm ci` and `npm test`. Do not cache `node_modules`, use `npm install` as a fallback, or use `--if-present` or `continue-on-error` to hide missing scripts or failures. Action input paths remain repository-relative even when shell commands have a plugin-local working directory.

A broad `lts/*` runtime can change major versions and native-module compatibility without a repository change. Pinning one Node patch forever would miss fixes. A bounded Node 24 range provides updates while respecting the observed minimum version.

### Make Task Board match the existing command convention

Add `"test": "vitest run"` to `bb-task-board/package.json`. Keep its existing `vitest.config.ts`, dependency versions, and lockfile resolution unchanged. A scripts-only manifest edit does not require dependency regeneration.

Calling `npx vitest` specially from CI would work but leave local contributors without the same `npm test` entry point used by the other plugins.

### Provision the SQLite CLI only where needed

Before the Tasks Plus suite, install `sqlite3` through the Ubuntu package manager and assert it is executable with `sqlite3 --version`. A package-manager or version-check failure must stop that job. The regression test already substitutes its own BB executable, so no BB installation is needed.

Relying on the current runner image's incidental packages could produce green results with a silently skipped import test after an image update.

### Keep pull-request execution unprivileged

Set workflow token permissions to `contents: read` and disable checkout credential persistence. Use `pull_request`, not `pull_request_target`. Do not request secrets or install or authenticate BB or Pi. Leave deployment, bundle checks, and repository branch-protection settings outside this workflow.

This permits approved fork contributions to run tests without privileged access. GitHub may still require a maintainer to approve a first-time contributor's workflow run.

### Validate the workflow and the commands it executes

Use the workflow file, package test commands, and GitHub check results as the acceptance boundaries. Validate workflow syntax and expressions with `actionlint`, check that the matrix covers all seven directories, and run clean installs followed by tests under a compatible Node 24 runtime. For Tasks Plus, explicitly confirm the import regression test ran rather than skipped.

Document these commands, the Node minimum, the SQLite prerequisite, and the exclusion of BB-dependent bundle checks in `README.md`. Do not add a custom workflow-testing framework. Inspect failure propagation and permission settings as part of review, then verify all seven checks on the first authorized GitHub run. Local validation cannot prove GitHub event dispatch or runner-specific behavior.

## Risks / Trade-offs

- Existing failures or Linux-only assumptions may appear on a clean runner. Report them without weakening CI or silently expanding this change into unrelated fixes.
- Native SQLite installation may need compilation if a prebuilt binary is unavailable. Ubuntu runners supply build tools; validate clean installation rather than reusing local modules.
- Seven jobs consume more runner capacity than a serial job. Cache npm downloads and cancel superseded runs while keeping complete per-plugin results.
- The static matrix can omit a future plugin. Document that new plugin directories must be added to the matrix.
- GitHub-hosted execution has not been tested during planning. Treat hosted verification as pending until an authorized push or pull request produces results.

## Migration Plan

No data migration is needed. Add the workflow, Task Board script, and README instructions in one change. Run local validation before publishing through the user's normal Git workflow. On the first authorized GitHub run, confirm all seven named checks finish and the Tasks Plus import test executes. Do not configure required checks or branch protection automatically.

Rollback removes the workflow; the Task Board test script remains independently useful and can be kept or reverted with the same change.
