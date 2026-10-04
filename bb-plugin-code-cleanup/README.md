# Code Cleanup

Code Cleanup adds project guidance controls to BB Settings. Its factory prompt asks agents to record substantial adjacent cleanup as separate BB Tasks and continue their assigned work. The plugin does not inspect code or create tasks itself.

## Use Settings

With the plugin enabled and running, open Settings and select Code Cleanup in the plugin sidebar. In Project guidance, select a standard project. Selection writes nothing.

Project selection and the saved On/Off control come first. The Markdown editor has an icon toolbar for Edit, Preview, Save prompt, and Reset to plugin default. Each icon has an accessible name and a hover/focus tooltip. Use Left/Right, Home, and End to move between Edit and Preview. Reset uses a restore icon, not a delete icon. Controls keep their touch targets when the toolbar wraps.

The metadata shows the saved prompt source and draft character count. Edit shows source text. Preview renders the draft with BB's public Markdown component where supported, with a source-only fallback on older hosts. Save stores source, not rendered output. Custom text replaces the factory prompt. Prompts remain editable while the project is Off.

Save accepts nonblank text up to 4,096 JavaScript string characters and preserves the submitted text, including newlines, spaces, Markdown, and literal shell characters. Save reports success only after persistence. Failed Save or Reset keeps the draft and saved state. During writes, edits and project selection are disabled. Switching a dirty project offers discard/cancel. Reset requires confirmation before it removes saved custom text and any draft. Enablement and other projects remain unchanged.

The short session note applies to newly constructed agent sessions only. Existing provider sessions keep their earlier guidance. The help icon discloses the BB Tasks CLI and single linked tracker requirement. Settings does not create tasks, trackers, or workers.

## Factory behavior and upgrade preservation

Reset now restores task-recording guidance, rather than the former reporting-only policy. Upgrade alone preserves every saved custom prompt exactly and keeps enablement unchanged. Only an explicit Save or confirmed Reset changes project text.

The factory guidance directs agents to find one tracker linked to the BB project, search all open-task pages, reuse matches, and record actionable follow-ups with source task/thread context. Labels must exist, and required blockers need verified task keys. Missing or ambiguous trackers, unavailable CLI, and failed search/create/dependency writes produce an honest report. The agent records only; it does not perform unrelated cleanup, dispatch workers, notify threads, or change the current task's status.

This editor blocks overlapping writes within its own view. Cross-client refresh and stale-write preconditions belong to the later concurrency slice. Do not use this version for an unattended all-project reset while another client can edit prompts. An approved local bulk reset is a separate operation, not an upgrade migration.

## Test the isolated Settings preview

Run `npm ci`, then `npm run preview:settings` from this package. Open `http://127.0.0.1:4888/`. Set `PORT` to use another port.

The preview renders the actual app entry with a small public app runtime adapter. Requests use official fake-host RPC and temporary real SQLite, not production storage. Alpha starts On with multiline custom text. Beta starts Off with the factory prompt. Personal projects are excluded. Fixture links cover empty, load-failure, save-failure, and slow-request states. Restarting resets fixture values.

The fixture uses a development-only Markdown substitute. It skips raw HTML and image requests; tests check literal code, unsafe links, and HTML. This substitute and the official frontend harness do not prove BB's production Markdown parser. Live checks cover native Settings discovery, rendering, theme, and reload behavior separately. Before live deployment, preserve private state/source/build snapshots, take a supported database backup, and prepare rollback. Never publish raw prompt backups.

## CLI

From this directory, run `bb plugin build` and `bb plugin install . --yes`. BB enables plugins globally, but Code Cleanup starts off for every project. Use a standard project ID from `bb project list`:

```sh
bb code-cleanup enable --project proj_ID
bb code-cleanup show --project proj_ID
bb code-cleanup disable --project proj_ID
bb code-cleanup prompt set --project proj_ID --text 'Project-specific instructions'
bb code-cleanup prompt reset --project proj_ID
```

`show` reports enablement and custom/default source. Disable keeps custom text. Reset changes only prompt text. For multiline input, pass the exact source as one `--text` argument. A single-quoted shell argument can contain newlines; if source contains single quotes, use an argument-array process API instead of shell interpolation. There is no supported `--text-stdin` flag.

Settings survive reload and global disable/re-enable. Personal, projectless, and side-chat contexts receive no contribution. `bb plugin disable code-cleanup` unloads the plugin globally and affects fresh sessions. Re-enable it before using its CLI again.

The [command reference](skills/code-cleanup/SKILL.md) is not auto-imported into agent sessions. `bb.skills: []` keeps the dynamic guidance contribution in one place.
