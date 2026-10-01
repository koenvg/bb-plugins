# Code Cleanup

This headless BB plugin reminds agents to report substantial adjacent cleanup to the user without abandoning the work at hand. It does not inspect code or create tasks.

## Set up a project

From this directory, run `bb plugin build` and `bb plugin install . --yes`. BB enables plugins globally, but Code Cleanup starts **off for every project**. Get a standard project ID with `bb project list`, then choose which projects receive guidance:

```sh
bb code-cleanup enable --project proj_ID
bb code-cleanup show --project proj_ID
bb code-cleanup disable --project proj_ID
```

A disabled project keeps its prompt override. `show` reports whether the project is enabled and whether it uses the default or a custom prompt. Other projects remain off. Personal, projectless, and side-chat contexts never receive this guidance.

## Change the wording

```sh
bb code-cleanup prompt set --project proj_ID --text "Your project instructions here"
bb code-cleanup prompt reset --project proj_ID
```

The custom text **replaces** the default, rather than being appended to it. It must be nonblank and at most 4,096 characters. To enter multiline text, pipe it to `bb code-cleanup prompt set --project proj_ID --text-stdin`. Reset restores the default without changing the project's enabled state. Settings survive a plugin reload and global disable/re-enable.

BB has no OpenForge-style per-project plugin enable switch. `bb plugin disable code-cleanup` unloads the plugin globally, so its guidance stops being contributed to **new sessions**. A provider session that was already constructed may keep its earlier instructions until BB constructs another session. You must re-enable the plugin globally before its `bb code-cleanup` command is available again.

The default instructions ask agents to report worthwhile follow-up candidates to the user. Code Cleanup does not create tasks or depend on a task plugin.

The [command reference](skills/code-cleanup/SKILL.md) is not auto-imported into agent sessions. `bb.skills: []` keeps the dynamic instruction block in one place.
