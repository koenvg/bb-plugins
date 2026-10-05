# BB plugins

Each directory is a separate BB plugin. GitHub Insight and Tasks Plus were copied from [koenvangeert/bb-plugins-collibra](https://github.com/koenvangeert/bb-plugins-collibra) at commit `178c5c8e8dafa2f8f4f2567e855cbad7bd869836`.

| Plugin           | Directory                                                |
| ---------------- | -------------------------------------------------------- |
| Changes          | [`bb-plugin-changes`](bb-plugin-changes)                 |
| Code Cleanup     | [`bb-plugin-code-cleanup`](bb-plugin-code-cleanup)       |
| Codex Inspired   | [`bb-plugin-codex-inspired`](bb-plugin-codex-inspired)   |
| Compose Chat     | [`bb-plugin-compose-chat`](bb-plugin-compose-chat)       |
| Threads with PRs | [`bb-plugin-pr-thread-list`](bb-plugin-pr-thread-list)   |
| Task Board       | [`bb-task-board`](bb-task-board)                         |
| GitHub Insight   | [`bb-plugin-github-insight`](bb-plugin-github-insight)   |
| Tasks Plus       | [`bb-plugin-tasks-plus`](bb-plugin-tasks-plus)           |
| Markdown Reader  | [`bb-plugin-markdown-reader`](bb-plugin-markdown-reader) |

Install one plugin at a time from Git with `--subdirectory`, for example:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-github-insight
```

For a local checkout, run `npm ci` and `bb plugin build` in the selected directory before `bb plugin install .`. Follow each plugin's README for setup and compatibility details.

Codex Inspired is an optional theme, independent of Compose Chat. After its package is published on `main`, install and select it with:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-codex-inspired
bb theme set plugin:codex-inspired:codex-inspired
```

Installation alone does not change your active theme. See its [README](bb-plugin-codex-inspired/README.md) for local development, compatibility, and safe source-path migration.

Tasks Plus replaces BB's bundled Tasks plugin and uses `bb tasks`; Task Board is a separate plugin with its own database and `bb task-board` command. Don't install both unless you intend to use both. Code Cleanup's default guidance refers to Task Board.

## Formatting and linting

Use [Oxfmt and Oxlint](https://oxc.rs/) for this repository. Install the pinned tools once at the repository root:

```sh
npm ci
npm run check
```

To format files or apply safe lint fixes:

```sh
npm run format
npm run lint:fix
```

`npm run lint` and `npm run format:check` check files without changing them. To check one plugin, run these commands in its directory after installing the root tools. You can also pass a path from the root, for example `npm run lint -- review-ui`.

The root package contains development tools only. It does not use npm workspaces or replace each plugin's dependencies. Plugin tests and builds still need `npm ci` in that plugin's directory. Published plugin installs do not need the root tools.

The shared [lint config](.oxlintrc.json) makes correctness violations errors. Existing findings remain warnings in specific files so this migration does not change plugin behavior. The shared [format config](.oxfmtrc.json) uses two spaces, double quotes, semicolons, and a 100-column line width. It does not sort imports or package fields. Generated output, lockfiles, test data, copied agent skills, and archived OpenSpec plans are excluded from formatting.

## Running tests and typechecks

Use Node 24.15 or newer within Node 24. Each plugin has its own dependencies, test command, and typecheck command. From the repository root, for example:

```sh
cd bb-plugin-code-cleanup
npm ci
npm test
npm run typecheck
```

Run the validation commands only after setup succeeds, and inspect each command's exit status. Run tests and typecheck separately, not through an `&&` chain, so failed tests do not skip typecheck. A passing typecheck does not cancel a test failure. Tests run once rather than watching for changes.

Use the same commands in any other plugin directory. Tasks Plus also needs the SQLite CLI on `PATH`; check it with `sqlite3 --version`. On Ubuntu, install it with `sudo apt-get update && sudo apt-get install -y sqlite3`. GitHub Insight needs its sibling dependencies before either validation command; from `bb-plugin-github-insight`, run `npm ci --prefix ../bb-plugin-pr-thread-list` after its own `npm ci`. Keep the repository layout intact, because Changes checks shared `review-ui` files. These validation commands do not require a BB installation or account credentials.

Typechecking uses each plugin's existing local compiler and configuration. A pass applies only to the configured file set; it does not prove that excluded source or tests were checked.

For Tasks Plus, run `npm ci` followed by `npm run lint` in `bb-plugin-tasks-plus`. Oxlint remains a locked development dependency; its lint command uses the shared repository config, with no global lint binary required.

## GitHub Actions

The [Tests workflow](.github/workflows/tests.yml) runs all remaining plugins on pull requests and pushes to `main`. Each plugin gets a separate Ubuntu job with Node 24.15 or newer within Node 24, an npm download cache keyed by its lockfile, and the same `npm ci`, `npm test`, and `npm run typecheck` commands shown above. CI installs the SQLite CLI for Tasks Plus and runs its `npm run lint` command with the local Oxlint dependency. GitHub Insight gets the sibling PR thread-list's locked dependencies before validation.

Each plugin has one combined result. After required setup succeeds, both validation steps run, with tests before typecheck, even if lint or tests fail. Failed setup stops both steps. Missing scripts, missing local compilers, and failed lint, test, or typecheck commands fail the job. Cancellation or the 20-minute timeout can stop unfinished checks.

A failed plugin check does not cancel the other plugin checks. New commits cancel superseded runs for the same pull request or branch. Approved fork pull requests run without repository secrets or write permissions; GitHub may require maintainer approval before they start.

This workflow runs tests and typechecks for all plugins and lint for Tasks Plus. A separate job installs the root tools and runs `npm run check` for lint and formatting across the repository. The workflow does not run builds, releases, coverage uploads, or Codex Quota's BB-dependent `test:bundle` command. It does not configure branch protection.

When adding a plugin, give it `npm test` and `npm run typecheck` scripts and add its directory to the workflow's `matrix.plugin` list. Include any required setup in both validation-step conditions so failed setup cannot start either check.
