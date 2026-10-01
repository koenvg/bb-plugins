# BB plugins

Each directory is a separate BB plugin. GitHub Insight and Tasks Plus were copied from [koenvangeert/bb-plugins-collibra](https://github.com/koenvangeert/bb-plugins-collibra) at commit `178c5c8e8dafa2f8f4f2567e855cbad7bd869836`.

| Plugin | Directory |
| --- | --- |
| Code Cleanup | [`bb-plugin-code-cleanup`](bb-plugin-code-cleanup) |
| Liquid Glass | [`bb-plugin-liquid-glass`](bb-plugin-liquid-glass) |
| Threads with PRs | [`bb-plugin-pr-thread-list`](bb-plugin-pr-thread-list) |
| Task Board | [`bb-task-board`](bb-task-board) |
| GitHub Insight | [`bb-plugin-github-insight`](bb-plugin-github-insight) |
| Tasks Plus | [`bb-plugin-tasks-plus`](bb-plugin-tasks-plus) |

Install one plugin at a time from Git with `--subdirectory`, for example:

```sh
bb plugin install git:https://github.com/koenvg/bb-plugins.git@main --subdirectory bb-plugin-github-insight
```

For a local checkout, run `npm ci` and `bb plugin build` in the selected directory before `bb plugin install .`. Follow each plugin's README for setup and compatibility details.

Tasks Plus replaces BB's bundled Tasks plugin and uses `bb tasks`; Task Board is a separate plugin with its own database and `bb task-board` command. Don't install both unless you intend to use both. Code Cleanup's default guidance refers to Task Board.

## Running tests

Use Node 24.15 or newer within Node 24. Each plugin has its own dependencies and test command. From the repository root, for example:

```sh
cd bb-task-board
npm ci
npm test
```

Use the same commands in any other plugin directory. Tests run once rather than watching for changes. Tasks Plus also needs the SQLite CLI on `PATH`; check it with `sqlite3 --version`. On Ubuntu, install it with `sudo apt-get update && sudo apt-get install -y sqlite3`. These test commands do not require a BB installation or account credentials.

## GitHub Actions

The [Tests workflow](.github/workflows/tests.yml) runs all seven plugins on pull requests and pushes to `main`. Each plugin gets a separate Ubuntu job with Node 24.15 or newer within Node 24, an npm download cache keyed by its lockfile, and the same `npm ci` and `npm test` commands shown above. CI installs the SQLite CLI for Tasks Plus.

A failed plugin check does not cancel the other plugin checks. New commits cancel superseded runs for the same pull request or branch. Approved fork pull requests run without repository secrets or write permissions; GitHub may require maintainer approval before they start.

This workflow runs tests only. It does not run typechecks, lint, builds, releases, coverage uploads, or Codex Quota's BB-dependent `test:bundle` command. It does not configure branch protection.

When adding a plugin, give it an `npm test` script and add its directory to the workflow's `matrix.plugin` list.
