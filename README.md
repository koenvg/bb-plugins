# BB plugins

Current packages target BB 0.46 and SDK 0.6.37. See [source compatibility and verification limits](BB-0.46-COMPATIBILITY.md). The [BB 0.45 report](BB-0.45-COMPATIBILITY.md) is historical.

MCP targets BB 0.46 and SDK 0.6.37. See its [compatibility checkpoint](bb-plugin-mcp/VERIFICATION-BBP85-BB046.md).

Pi with subagents targets BB 0.47.1 and SDK 0.6.79 in source. Installed lifecycle acceptance remains incomplete. See its [compatibility limits](bb-plugin-pi-subagents-provider/COMPATIBILITY.md).

Each directory is a separate BB plugin. GitHub Insight and Tasks Plus were copied from [koenvangeert/bb-plugins-collibra](https://github.com/koenvangeert/bb-plugins-collibra) at commit `178c5c8e8dafa2f8f4f2567e855cbad7bd869836`.

| Plugin            | Directory                                                            |
| ----------------- | -------------------------------------------------------------------- |
| Changes           | [`bb-plugin-changes`](bb-plugin-changes)                             |
| Code Cleanup      | [`bb-plugin-code-cleanup`](bb-plugin-code-cleanup)                   |
| Codex Inspired    | [`bb-plugin-codex-inspired`](bb-plugin-codex-inspired)               |
| Codex Quota       | [`bb-plugin-codex-quota`](bb-plugin-codex-quota)                     |
| Compose Chat      | [`bb-plugin-compose-chat`](bb-plugin-compose-chat)                   |
| Threads with PRs  | [`bb-plugin-pr-thread-list`](bb-plugin-pr-thread-list)               |
| GitHub Insight    | [`bb-plugin-github-insight`](bb-plugin-github-insight)               |
| Tasks Plus        | [`bb-plugin-tasks-plus`](bb-plugin-tasks-plus)                       |
| Live Output       | [`bb-plugin-live-output`](bb-plugin-live-output)                     |
| Markdown Reader   | [`bb-plugin-markdown-reader`](bb-plugin-markdown-reader)             |
| MCP               | [`bb-plugin-mcp`](bb-plugin-mcp)                                     |
| Pi with subagents | [`bb-plugin-pi-subagents-provider`](bb-plugin-pi-subagents-provider) |
| Browser Annotate  | [`bb-plugin-browser-annotate`](bb-plugin-browser-annotate)           |

Install one plugin at a time from Git with `--subdirectory`, for example:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-github-insight
```

For a local checkout, run `bun install --frozen-lockfile`, then `bb plugin build` in the selected directory before `bb plugin install .`. Follow each plugin's README for setup and compatibility details.

Codex Inspired is an optional theme, independent of Compose Chat. After its package is published on `main`, install and select it with:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-codex-inspired
bb theme set plugin:codex-inspired:codex-inspired
```

Installation alone does not change your active theme. See its [README](bb-plugin-codex-inspired/README.md) for local development, compatibility, and safe source-path migration.

Tasks Plus replaces BB's bundled Tasks plugin and keeps the `bb tasks` command. Enable only one of these two plugins at a time. Follow the [replacement and data import steps](bb-plugin-tasks-plus/README.md#replace-the-bundled-plugin-with-this-fork) before switching.

Code Cleanup's [default guidance](bb-plugin-code-cleanup/guidance.ts) uses `bb tasks`. It requires one tracker whose `linkedBbProjectId` matches the current BB project. Use the tracker prefix or ID for task commands, never the BB project ID. If the CLI is unavailable or the tracker is missing or ambiguous, report the problem and ask for a linked tracker or the CLI. Do not file cleanup in another tracker. The guidance searches all open-task pages, reuses matches, and records follow-ups without starting cleanup work. Saved custom prompts replace this default.

## BB worktree setup

BB runs the tracked root `.bb-env-setup.sh` when it creates a new managed worktree. The hook requires Bun 1.4.4, pinned in `.bun-version`. One frozen workspace install prepares the root tools, all plugins, shared Markdown, and `review-ui`. It then builds shared Markdown for its consumers. Dependencies stay inside the worktree; Bun can reuse its download cache.

The hook includes dev dependencies even when `NODE_ENV=production`. The repository root `bun.lock` owns every workspace resolution. Missing locks, unsupported Bun versions, and failed installs or builds stop provisioning with a non-zero exit. Repeating setup uses the same lockfile without changing it.

Setup does not install or select Node, download browser binaries, install system tools such as SQLite, run tests, or activate plugins in BB. Those prerequisites still apply to the relevant checks. Existing attached checkouts do not run the hook automatically. The hook must be committed and present on the ref used to create the worktree before automatic setup takes effect.

To prepare an existing checkout, run `bash .bb-env-setup.sh` from the repository root. Test the hook with `bun run test:setup`.

## Root checks, formatting, and linting

Use [Oxfmt and Oxlint](https://oxc.rs/) for this repository. From the repository root, prepare workspace dependencies and shared Markdown before running checks:

```sh
bash .bb-env-setup.sh
bun run check
```

`bun run check` runs setup tests, installed-workspace checks, browser lifecycle tests, lint, and formatting checks in order. It stops on the first failure. The lifecycle tests exercise local fixture servers and process cleanup without Chromium. Run them separately with `bun run test:browser-lifecycle`.

To format files or apply safe lint fixes:

```sh
bun run format
bun run lint:fix
```

`bun run lint` and `bun run format:check` check files without changing them. To check one plugin, run these commands in its directory after installing the root tools. You can also pass a path from the root, for example `bun run lint review-ui`.

The root `package.json` declares Bun workspaces for `bb-plugin-*`, `packages/*`, and `review-ui`. Each package keeps its dependency declarations and scripts. One root `bun.lock` records their resolved versions and dependency overrides. `bunfig.toml` selects isolated linking so packages resolve their declared dependencies without relying on hoisting. Do not add package-local lockfiles. Bun automatically finds the workspace root when invoked inside a workspace.

The shared [lint config](.oxlintrc.json) makes correctness violations errors. Existing findings remain warnings in specific files so this migration does not change plugin behavior. The shared [format config](.oxfmtrc.json) uses two spaces, double quotes, semicolons, and a 100-column line width. It does not sort imports or package fields. Generated output, lockfiles, test data, copied agent skills, and archived OpenSpec plans are excluded from formatting.

## Running tests and typechecks

Use Bun 1.4.4 for installs and package scripts. Keep Node 26.0 or newer within Node 26 on `PATH` for Vitest and Node-host bundle checks. Several existing Vitest/jsdom suites and Quota's artifact-reload check do not run correctly under Bun, so these checks retain their supported Node runtime. Each plugin has its own dependencies, test command, and typecheck command. From the repository root, for example:

```sh
bash .bb-env-setup.sh
bun run --cwd bb-plugin-code-cleanup test
bun run --cwd bb-plugin-code-cleanup typecheck
```

Run the validation commands only after setup succeeds, and inspect each command's exit status. Run tests and typecheck separately, not through an `&&` chain, so failed tests do not skip typecheck. A passing typecheck does not cancel a test failure. Tests run once rather than watching for changes.

Use the same commands for another plugin. Tasks Plus also needs the SQLite CLI on `PATH`; check it with `sqlite3 --version`. On Ubuntu, install it with `sudo apt-get update && sudo apt-get install -y sqlite3`. Workspace setup includes GitHub Insight's PR thread-list dependency and Tasks Plus's Quota fixture dependency. Keep the repository layout intact, because review consumers use shared `review-ui` source. These validation commands do not require a BB installation or account credentials.

Typechecking uses each plugin's existing local compiler and configuration. A pass applies only to the configured file set; it does not prove that excluded source or tests were checked.

For Tasks Plus, run `bun install --frozen-lockfile` followed by `bun run lint` in `bb-plugin-tasks-plus`. Oxlint remains a locked development dependency; its lint command uses the shared repository config, with no global lint binary required.

## Browser tests

Vitest remains the main test runner. Compose Chat, Markdown Reader, and Codex Quota also have TypeScript Playwright suites for their local browser fixtures. These replace the Python browser scripts, not the Vitest or script tests.

From the repository root, install each package and Chromium once:

```sh
for plugin in bb-plugin-compose-chat bb-plugin-markdown-reader bb-plugin-codex-quota; do
  bun install --cwd "$plugin" --frozen-lockfile || exit
  (cd "$plugin" && bun --bun run playwright install chromium) || exit
done
bun run test:browser
```

On Linux, use `playwright install --with-deps chromium` to install browser system dependencies too. To run one suite, use `bun run --cwd bb-plugin-markdown-reader test:browser`, for example. The root command runs packages in sequence and stops on the first failure.

Each suite builds or serves current local fixture code and launches its own Chromium. It does not use a signed-in browser, installed BB, real hosts, or billing data. Screenshots are evidence captures, not pixel-baseline comparisons. Reports go to each package's ignored `playwright-report/` and `test-results/` directories; failures retain screenshots and traces. See each package's browser-testing instructions for its coverage and limits.

## GitHub Actions

The [Tests workflow](.github/workflows/tests.yml) runs the plugin matrix on pull requests and pushes to `main`. Each plugin gets a separate Ubuntu job with Bun from `.bun-version` and Node 26.0 or newer within Node 26 for Vitest. Each job runs `bash .bb-env-setup.sh` once, then the plugin's tests and typecheck. CI installs the SQLite CLI for Tasks Plus and runs its lint command with the local Oxlint dependency.

Each plugin has one combined result. After required setup succeeds, both validation steps run, with tests before typecheck, even if lint or tests fail. Failed setup stops both steps. Missing scripts, missing local compilers, and failed lint, test, or typecheck commands fail the job. Cancellation or the 20-minute timeout can stop unfinished checks.

A failed plugin check does not cancel the other plugin checks. New commits cancel superseded runs for the same pull request or branch. Approved fork pull requests run without repository secrets or write permissions; GitHub may require maintainer approval before they start.

This workflow runs tests and typechecks for all plugins and lint for Tasks Plus. The quality job uses the same workspace setup and runs `bun run check` across the repository. Any failure fails the job. A separate browser matrix installs Chromium with its system dependencies and runs the four Playwright suites. It saves reports, screenshots, and failure traces for seven days when the run is not canceled. Local fixture passes do not prove installed BB integration.

When adding a plugin, give it `bun run test` and `bun run typecheck` scripts and add its directory to the workflow's `matrix.plugin` list. Include any required setup in both validation-step conditions so failed setup cannot start either check.
