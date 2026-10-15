# Project cleanup guidance

Users inspect project guidance, choose inherited or explicit enablement, and edit a project's saved prompt without changing other projects.

## Sub-features

- cleanup-overview: confirmed project choices and prompt sources.
- cleanup-enable: explicit On/Off, host default and Use default.
- cleanup-prompt: Edit/Preview, Save, Cancel/discard and immediate Reset.
- cleanup-conflict: stale prompt preconditions, reconnect and read-only reload recovery.

## How to get to it (user POV)

- Open Settings and select Code Cleanup in the plugin sidebar.
- In Project guidance choose a project name or Edit prompt; use the row switch or Use default.
- Read one project's effective state with `bb code-cleanup show --project "$PROJECT_ID"`, using the resolved standard project ID.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-code-cleanup/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Run the package's tests/typecheck first. A local UI preview exists: from bb-plugin-code-cleanup run `PORT=4889 bun preview/server.ts`, record its PID, and open http://127.0.0.1:4889/ only after verifying that PID owns the listener. Require the port to be free; choose another free port explicitly if needed, never reuse a shared instance. The preview owns temporary real SQLite and the official fake-host RPC boundary. Choose Alpha's Edit prompt, change the draft, switch to Preview, then Cancel and Discard changes. Reopen to prove the saved text was untouched. Next save a uniquely identified prompt on Beta and reopen to prove persistence; restore only this owned fixture text. Use two owned preview tabs for a conflict, preserving the losing draft. Teardown sends TERM only to the recorded preview PID and closes owned tabs; its server handles Vite, SQLite and host teardown. Live Settings/CLI checks use the installed workflow and a ledger before any setting mutation.

## Gotchas

- The preview substitutes its Markdown component and host Settings form; it does not prove BB's native Markdown/form rendering.
- Two tabs on one preview share SQLite, intentionally. Do not double-drive one shared tab.
- Reset saves immediately; later Cancel does not undo it.
- Guidance affects fresh provider sessions. Do not start an agent merely to test this without approval.
