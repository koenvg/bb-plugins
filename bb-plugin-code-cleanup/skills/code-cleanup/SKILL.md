---
name: code-cleanup
description: Manage the Code Cleanup plugin's project opt-in and custom guidance through the BB CLI.
disable-model-invocation: true
---

# Code Cleanup commands

This is a command reference, not the cleanup policy given to agents. The package sets `bb.skills: []`, so BB does not auto-import it. See the package README for install and lifecycle limits.

Use a standard project ID from `bb project list` and specify it on every command:

```sh
bb code-cleanup enable --project proj_ID
bb code-cleanup disable --project proj_ID
bb code-cleanup show --project proj_ID
bb code-cleanup prompt set --project proj_ID --text "Project-specific instructions"
bb code-cleanup prompt reset --project proj_ID
```

`show` reports enabled/disabled and custom/default. Disabled projects retain their custom text. `prompt set` replaces the factory source and rejects blank text or more than 4,096 characters. Pass exact multiline source as one `--text` argument, with safe quoting or an argument-array process API. There is no supported `--text-stdin` flag. `prompt reset` changes only text and now restores guidance that asks agents to record substantial cleanup through BB Tasks. Upgrade alone keeps custom source unchanged. Task recording requires an available CLI and one tracker linked to the current BB project; the plugin never creates tasks itself.
