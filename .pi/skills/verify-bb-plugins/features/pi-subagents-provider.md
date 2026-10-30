# Pi with subagents provider

Users select the independent Pi provider, inspect subagent work/history and preserve ordinary Pi interactions and native speed choices.

## Sub-features

- pi-select: provider pi-subagents alongside bundled pi.
- pi-panel: read-only Subagents task/transcript/output and nested structure.
- pi-lifecycle: start/resume, compaction, background observation and captured-history recovery.
- pi-speed: native Default or capability-confirmed Fast; Ultrafast must be absent because its wire mapping is unverified.

## How to get to it (user POV)

- Select Pi with subagents through BB's provider picker for an approved owned thread.
- Open its Subagents panel when existing subagent evidence is present.
- Use the native speed selector; /speed refresh is the documented capability recovery command, not a model prompt.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-pi-subagents-provider/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Run package tests/typecheck and read its compatibility limits. Doctor distinguishes plugin pi-subagents-provider from provider pi-subagents and confirms both exact installed source and actual selected thread provider. The current BB 0.46 / SDK 0.6.49 package uses the normal passing SDK gate. The preserved exception is historical, limited to BB 0.44.0 / SDK 0.5.29; it does not apply to this revision or another plugin. Installed lifecycle proof requires approval to create/start/resume an owned thread and any child work. First observe ordinary Pi tools/dialogs and existing Subagents history read-only; capture panel opening, task structure and bounded output. Then, only within an approved run, observe background task completion, manual compaction and reopening persisted history. Verify native speed admission and any refusal without dispatching a billed turn as a diagnostic. Use captured history evidence and public bridge observations, not a fabricated viewer state.

For the isolated viewer regression, reuse prepared dependencies and cached Chromium. From the repository root, run the existing evidence wrapper with a new private directory:

```sh
.pi/skills/verify-bb-plugins/scripts/browser.sh pi-subagents-provider "$EVIDENCE/subagents-browser"
```

This mounts production `SubagentsView` and CSS with one schema-validated, byte-bounded synthetic capture through the public SDK testing runtime. It opens repeated long-label rows, checks painted Entry 3/4 references, native clicks and browser keys, distinct captured tasks/transcripts/outputs/run IDs, close-only behavior and reopening. It covers a wide view, a 360px panel inside a 1280px viewport and a 375px viewport. Narrow labels, purposes and opened tabs must actually overflow with ellipsis while references remain visible. Omission and bounded-history notices describe the seed, not retention or budget algorithm acceptance.

The runner owns a fresh loopback listener, temporary assets and browser contexts. The suite blocks service workers, fails on browser errors or attempted external traffic, and keeps narrow screenshots and traces in the wrapper's private evidence directory. No provider, paid turn, installed BB, response replacement or browser-callable state/selection API is involved.

The SDK testing Markdown renderer is a plain-text stand-in. This proves internal native browser interactions and attribution text, not installed Markdown fidelity, native composer interception, provider lifecycle or persistence. Keep fixture and installed acceptance results separate.

## Gotchas

- Source regression passes do not establish installed lifecycle/persistence safety; the package README explicitly leaves that acceptance open.
- Selecting bundled Pi for new work is a rollback option, not permission to delete fork session files.
- Disabling this provider may interrupt active work; stop/settle only approved owned sessions first.
- The fork must not enable/load pi-subagents merely to make a view available, or change global Pi credentials/defaults.
