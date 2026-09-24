# BB plugins

Each directory is a separate BB plugin. GitHub Insight and Tasks Plus were copied from [koenvangeert/bb-plugins](https://github.com/koenvangeert/bb-plugins) at commit `b6bd25a2f94a6390313e464826aecd13f456f186`.

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
