# Installed behavior checks

Select branches from the changed behavior and manifest contributions. A missing `bb.app` is not proof that a plugin has no visible UI.

## Browser-visible behavior

1. Read [the dedicated Chrome browser contract](browser-contract.md). Resolve approval, process/profile identity, the explicit CDP endpoint, a unique `BU_NAME`, and strict daemon reuse before connection. Confirm the intended BB URL from the current instance, not a guessed port or another environment.
2. Create and record an owned tab before navigation. Select its recorded target before every script. At connection or authentication blockers, stop the dependent checks and follow the contract's blocked branch. Keep the same owned scope for cleanup.
3. Navigate through the intended BB interface. Wait for the affected element to become visible. Use fresh accessibility nodes and visible coordinates, then reinspect after navigation or a rerender.
4. Perform the action and inspect its expected result. If persistence is part of the change, reload or reopen the owned page and check the persisted value. Exercise meaningful empty/error states only when safe test inputs exist.
5. Capture a screenshot to an explicit local PNG path after the relevant result. Check the frame for secrets and unrelated private content before retaining or sharing it. Prefer a safely framed view; otherwise withhold the screenshot and explain the evidence gap.
6. Inspect available browser diagnostics and the selected plugin's runtime logs around the interaction. Distinguish new errors from pre-existing logs. If console/network collection is unsupported, state that limitation rather than claiming no errors occurred. A visible page with a failing changed interaction is a failed check.
7. Attempt the contract's scoped cleanup even after a browser command fails. Confirm owned target closure and report remaining resources. A missing strict connection blocks cleanup; it is not permission to discover another browser.

Browser Use scripts use the supported helpers shown in the contract and the installed CDP reference. Use explicit target IDs, not legacy session commands or saved state indices.

Process large snapshots/logs from files and return only relevant observations. JavaScript inspection may read DOM properties or runtime identifiers. Do not replace network responses, inject passing values, or bypass the interaction being verified. Synthetic fixture tests belong in a separate automated-check row.

### Pages, sidebar replacements, and settings

Open the actual contributed page or select the intended sidebar. Capture the previous selection before changing it. Check the changed action, its visible outcome, navigation where affected, and refresh/persistence where promised. Restore the original selection and temporary settings during cleanup.

For PR badges, a real thread with an appropriate linked PR is a live prerequisite. No such thread means the badge check is blocked even if mock/fixture tests pass. Obtain permission before creating a thread or PR to supply test data.

### Themes and content scripts

Activate the contributed theme or script only within the approved scope. Inspect the affected BB controls, contrast, clipping, and layout at relevant sizes. Theme plugins can contribute visible UI through `bb.themes` without `bb.app`. Record and restore the previous theme, mode, or selection. Ask before enabling a disabled plugin.

## Backend and CLI behavior

Load the plugin's own command documentation and inspect installed help. Choose a bounded command or documented RPC that exercises the changed contract. Inspect the RPC input/output schema when available, then compare the installed response with the expected result. Use exact plugin/project identifiers and keep secrets out of command arguments and evidence.

An operation with no browser-visible effect does not need a ceremonial screenshot. State why the browser branch is non-applicable and link the installed-runtime evidence instead. A unit test alone does not establish that the installed backend uses the changed checkout.

## Host-backed behavior

Confirm the selected host and its availability before invoking host RPC. Check the affected behavior on that host, including its artifact/generation where exposed. Missing host access, account configuration, or authentication blocks the dependent check. Do not enroll another machine, copy credentials, or switch hosts to make a check pass without authorization.

## Actions with external or destructive effects

Inspect the action before clicking it. Buttons and CLI commands may start agents, send messages, spend money, publish changes, or delete records. Ask for the specific bounded action and its cleanup before running it. A permission refusal blocks that required check; it does not authorize a different route to the same effect.
