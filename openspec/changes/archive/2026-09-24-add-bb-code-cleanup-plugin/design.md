# Design

## Context

See [proposal.md](proposal.md) for motivation and [the capability spec](specs/code-cleanup-guidance/spec.md) for behavior. The installed BB Plugin SDK is `0.5.9`. `bb.agents.configure` receives a project ID, project kind, and thread origin synchronously at `thread.start` / `turn.submit`; its returned instructions enter the next constructed provider session, not a live session. BB's `bb plugin enable|disable` commands are global and have no `--project` option. Plugin settings are also global, and BB's settings-section slot has no project prop. The installed task-board plugin exposes `bb task-board list --project ID [--query TEXT]` and `bb task-board add --project ID --prompt TEXT [--priority LEVEL]`.

## Goals / Non-Goals

**Goals:**
- Keep contribution ownership with the loaded plugin so disabling it stops future prompt assembly.
- Provide explicit per-project opt-in and persistent full-text overrides without changing BB core or the task-board plugin.
- Keep the plugin headless and its prompt short enough for BB's 4,096-character instruction limit.

**Non-Goals:**
- A BB core project-level plugin enable switch or an OpenForge-style project settings page.
- A plugin tool that creates tasks, monitors source code, or decides which cleanup deserves a task.
- Retrofitting instructions in a provider session that BB has already constructed.

## Decisions

### One dynamic agent contribution

Add a standalone `bb-plugin-code-cleanup/` package with `bb.server` and no `bb.app` or agent tool. Register one `bb.agents.configure` callback returning `{ tools: [], skills: [], instructions }` for enabled standard projects, and `{ tools: [], skills: [] }` otherwise. Exclude side chats by `origin.pluginId === "side-chat"`. Do not also contribute a manifest skill, tool instruction, workspace file, or `contributeInstructions` callback carrying this policy. This avoids duplicate prompt sections, lets the host unregister the contribution on disable/reload, and gives the callback the project kind and origin missing from the legacy `contributeInstructions` context. The plugin may keep an unselected command reference under its own `skills/` directory, with `bb.skills: []`, but the instruction text lives only in the dynamic callback.

The default text says when a separate cleanup task is justified, when a style nit is not, and when to stay with the assigned task. It instructs the agent to check for an existing matching task with `bb task-board list --project <id> --query ...` and, if warranted, add a clear follow-up with `bb task-board add --project <id> --prompt "..."`. Use the resolved project ID rather than a current-task-ID placeholder. If the task-board command is unavailable, the agent reports the candidate to the user instead of pretending a task exists. Do not copy OpenForge task flags such as `--worktree`, `--depends-on`, or `--label`: the BB `add` command does not accept them. The agent chooses whether to create a task; the plugin never calls the task-board API.

Alternative rejected: an automatically imported skill or repository `AGENTS.md` would make per-project selection, live plugin ownership, or duplicate avoidance harder. The legacy instruction callback also lacks the side-chat context.

### Project state and management

Store rows keyed by BB project ID in the plugin-owned SQLite database: `enabled` plus a nullable custom instruction. Missing rows mean disabled, and disabling a project preserves its override. Read the row synchronously in `configure`; plugin storage opens during the factory and is closed by the host on disposal. The custom text replaces the default for that project. Validate a nonblank, at-most-4,096-character replacement and reject invalid writes without changing existing rows. Use `bb.sdk.projects.list` to confirm a CLI-selected project exists and is a standard project.

Expose one `bb code-cleanup` management command, preferably built with `defineCli`, with `enable --project ID`, `disable --project ID`, `show --project ID`, `prompt set --project ID --text TEXT`, and `prompt reset --project ID`. `show` reports project enablement and whether an override is active. Document commands in package README and plugin-local skill reference; do not select that skill as agent policy. A headless CLI avoids a frontend just for settings, while the project ID on each command prevents a global JSON setting from accidentally applying to the wrong project.

Alternative rejected: a global multiline settings JSON map is easier to wire but easy to overwrite across projects and awkward to edit. A project settings UI would need a project selector or custom RPC because BB's settings-section slot is not project-scoped.

### Tests and live boundary

Use `@get-bb/plugin-sdk/testing` and the project's Vitest pattern to resolve the actual registered agent configuration against enabled, disabled, other-project, personal, and side-chat fixtures. Exercise management CLI validation, overrides, independent projects, persistence through atomic reload, and disposal with fresh sessions. Assert the default text names the real BB commands and does not contain OpenForge commands or promise automatic creation. Use `experimental_scanPublicSdkOnly` for the new package. Unit tests prove what the plugin returns; a live BB check must install/enable the plugin, opt in one project, start fresh agent sessions for that project and another, then disable and test another fresh session. Use a read-only probe that instructs test agents not to create tasks; check the board remains unchanged. Restore live test settings and remove disposable test threads if created. Do not use the current running thread as proof of instruction removal.

## Risks / Trade-offs

- [No native project-level plugin enablement] -> State clearly that BB global enable is separate from this plugin's project opt-in commands.
- [Running sessions may keep old instructions after a toggle, reload, or disable] -> Document the next-session boundary and verify with freshly constructed sessions.
- [Task-board plugin may be disabled or its CLI unavailable on an agent host] -> Keep the prompt conditional; tell the agent to report the finding rather than claim a task was added.
- [Large or invalid custom guidance can be truncated or silently dropped by BB] -> Validate before storage, keep the default short, and test invalid input and cross-project isolation.
- [Existing uncommitted changes in this checkout] -> Add files only under the new plugin and this change during implementation; do not reset or overwrite other plugin work.

## Migration Plan

There is no existing BB Code Cleanup installation to migrate. Scaffold, test, and build the new plugin; install it as a local path, enable it globally, then enable selected projects using its CLI. Disabling it globally is the rollback for new sessions; stored per-project choices remain for re-enablement. Uninstall only if the stored configuration can be discarded.
