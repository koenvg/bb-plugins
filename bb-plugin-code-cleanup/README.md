# Code Cleanup

Code Cleanup adds project guidance controls to BB Settings. Its factory prompt asks agents to record substantial adjacent cleanup as separate BB Tasks and continue their assigned work. The plugin does not inspect code or create tasks itself.

## Use Settings

With the plugin enabled and running, open Settings and select Code Cleanup in the plugin sidebar. In Project guidance, select a standard project. Selection writes nothing.

The host field **Enable for projects without an override** comes first and starts Off on fresh install and upgrade. It applies to unconfigured standard projects, including future projects. It does not turn the BB plugin on or off and does not change explicit project choices.

The project switch shows effective On/Off. Changing it saves an explicit choice. The state line identifies Default or Project override. **Use default** removes only the enablement choice and keeps custom prompt text and any draft. It is unavailable when the project already follows the default. Explicit On and Off choices take precedence when the default changes.

The Markdown editor keeps its icon toolbar for Edit, Preview, Save prompt, and Reset to plugin default. Each icon has an accessible name and a hover/focus tooltip. Use Left/Right, Home, and End to move between Edit and Preview. Prompt Reset uses a restore icon, not a delete icon, and does not change enablement. Controls keep their touch targets when the toolbar wraps.

The metadata shows the saved prompt source and draft character count. Edit shows source text. Preview renders the draft with BB's public Markdown component where supported, with a source-only fallback on older hosts. Save stores source, not rendered output. Custom text replaces the factory prompt. Prompts remain editable while the project is Off.

Save accepts nonblank text up to 4,096 JavaScript string characters and preserves the submitted text, including newlines, spaces, Markdown, and literal shell characters. Save reports success only after persistence. Failed Save or Reset keeps the draft and saved state. During writes, edits and project selection are disabled. Switching a dirty project offers discard/cancel. Reset requires confirmation before it removes saved custom text and any draft. Enablement and other projects remain unchanged.

The short session note applies to newly constructed agent sessions only. Existing provider sessions keep their earlier guidance. The help icon discloses the BB Tasks CLI and single linked tracker requirement. Settings does not create tasks, trackers, or workers.

## Factory behavior and upgrade preservation

Prompt Reset restores task-recording guidance, rather than the former reporting-only policy. Upgrade preserves every saved custom prompt exactly. Existing enabled and disabled rows become explicit choices, including disabled rows created by saving a prompt in an older version. The new global default remains false. Only an explicit Save or confirmed prompt Reset changes project text.

The SQLite migration adds a nullable `enabled_override` column and copies each legacy `enabled` value once. It appends to the shipped migration list. Reload does not repeat the copy or pin newly inherited rows. Missing rows and new prompt-only rows follow the saved default. Saving or resetting a prompt never creates an enablement choice. Enable/disable writes both the legacy column and the override; Use default clears only the override.

The factory guidance directs agents to find one tracker linked to the BB project, search all open-task pages, reuse matches, and record actionable follow-ups with source task/thread context. Labels must exist, and required blockers need verified task keys. Missing or ambiguous trackers, unavailable CLI, and failed search/create/dependency writes produce an honest report. The agent records only; it does not perform unrelated cleanup, dispatch workers, notify threads, or change the current task's status.

Default changes update fresh eligible agent configuration without plugin reload. Open project views refresh enablement after a default-change signal or reconnect while keeping prompt drafts. CLI, RPC, and agent configuration share the same enablement resolver and saved Settings default.

This editor blocks overlapping writes within its own view. Cross-client refresh and stale-write preconditions belong to the later concurrency slice. Do not use this version for an unattended all-project reset while another client can edit prompts. An approved local bulk reset is a separate operation, not an upgrade migration.

## Test the isolated Settings preview

Run `npm ci`, then `npm run preview:settings` from this package. Open `http://127.0.0.1:4888/`. Set `PORT` to use another port.

The preview renders the actual app entry with a small public app runtime adapter. Requests use official fake-host RPC, the host Settings write driver, and temporary real SQLite, not production storage. Its default control renders the actual backend descriptor but is not BB's native host form. Alpha starts explicitly On with multiline custom text. Beta starts inherited Off with the factory prompt. Personal projects are excluded. Fixture links cover empty, load-failure, save-failure, and slow-request states. Restarting resets fixture values.

The fixture uses a development-only Markdown substitute. It skips raw HTML and image requests; tests check literal code, unsafe links, and HTML. This substitute and the official frontend harness do not prove BB's production Markdown parser. Live checks cover native Settings discovery, rendering, theme, and reload behavior separately. Before live deployment, preserve private state/source/build snapshots, take a supported database backup, and prepare rollback. Never publish raw prompt backups.

## CLI

From this directory, run `bb plugin build` and `bb plugin install . --yes` for a fresh installation. On a live installation, follow the backup and deployment steps below first. BB enables plugins globally; Code Cleanup's separate default starts false. Use a standard project ID from `bb project list`:

```sh
bb code-cleanup enable --project proj_ID
bb code-cleanup show --project proj_ID
bb code-cleanup disable --project proj_ID
bb code-cleanup enablement reset --project proj_ID
bb code-cleanup prompt set --project proj_ID --text 'Project-specific instructions'
bb code-cleanup prompt reset --project proj_ID
```

`show` reports effective enabled/disabled, custom/default prompt source, and `enablement: default` or `enablement: project override`. Disable keeps custom text. `enablement reset` returns only enablement to the saved default. `prompt reset` changes only prompt text. For multiline input, pass the exact source as one `--text` argument. A single-quoted shell argument can contain newlines; if source contains single quotes, use an argument-array process API instead of shell interpolation. There is no supported `--text-stdin` flag.

To change the default through the public host configuration command:

```sh
bb plugin config code-cleanup set enableByDefault true
bb plugin config code-cleanup set enableByDefault false
```

Enabling this default is a separate user choice. Upgrade must leave it false. All explicit enabled and disabled project choices stay unchanged.

Settings survive reload and global disable/re-enable. Personal, projectless, and side-chat contexts receive no contribution. `bb plugin disable code-cleanup` unloads the plugin globally and affects fresh sessions. Re-enable it before using its CLI again.

## Deployment and rollback

1. Obtain separate deployment approval. Before installing or reloading the new build, record the installed path/hash and snapshot every stored project choice and exact prompt, plus the host default setting. Preserve the prior source and `dist` privately. For the current live installation, the snapshot must cover all 12 enabled/custom rows.
2. Take a fresh, consistent SQLite backup through SQLite's backup API or the supported host backup mechanism. Do not copy an active WAL database file alone. Keep prompt backups private and verify the backup is readable before proceeding.
3. Build and validate in a private package copy when the live installation uses this worktree. Only replace the live build and reload after approval and the final backup. Leave `enableByDefault` false. Compare every saved choice and exact prompt with the snapshot, then check Settings, CLI, and fresh eligible session resolution.
4. For rollback, stop the plugin, restore the prior source/build, and restore the pre-upgrade database and host setting snapshot when needed. The retained legacy `enabled` column is not a complete rollback. The old build cannot represent inherited enablement or the new default. Restoring the backup discards configuration edits made after upgrade; warn the user before doing that. Restore only Code Cleanup state, not unrelated plugin data.

The [command reference](skills/code-cleanup/SKILL.md) is not auto-imported into agent sessions. `bb.skills: []` keeps the dynamic guidance contribution in one place.
