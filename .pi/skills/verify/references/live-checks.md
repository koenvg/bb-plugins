# Installed behavior checks

Select branches from the changed behavior and manifest contributions. A missing `bb.app` is not proof that a plugin has no visible UI.

## Browser-visible behavior

1. Run `browser-use doctor` and inspect the installed CLI help. Confirm the intended BB URL from the current instance, not a guessed port or another environment. If the server or browser cannot be reached, report that prerequisite.
2. Choose a unique session name, such as `verify-<plugin-id>-<run-id>`, and pass `--session` on every session command. Use a clean local managed Chromium session or an explicitly selected dedicated Chrome CDP session. Report which browser actually ran. Session isolation does not isolate BB data.
3. If a clean session needs authentication, ask the user to sign in to that session or provide an approved test setup. Keep browser checks blocked meanwhile. Do not attach to Arc, copy a personal profile's cookies, launch a cloud browser, or open a public tunnel as an automatic fallback.
4. Navigate through the intended BB interface. Wait for the affected element to become visible, obtain fresh state, and use those indices for interaction. Re-read state after navigation or a rerender; do not guess stale indices.
5. Perform the action and inspect its result. If persistence is part of the change, reload or reopen the page and check the persisted value. Exercise meaningful empty/error states only when safe test inputs exist.
6. Capture a screenshot to an explicit local PNG path after the relevant result. Check the frame for secrets and unrelated private content before retaining or sharing it. Prefer a safely framed view; otherwise withhold the screenshot and explain the evidence gap.
7. Inspect available browser diagnostics and the selected plugin's runtime logs around the interaction. Distinguish new errors from pre-existing logs. If console/network collection is unsupported, state that limitation rather than claiming no errors occurred. A visible page with a failing changed interaction is a failed check.
8. Close only this run's named session during cleanup, including after a browser command fails. Retry only within the same owned scope. Preserve enough failure evidence before replacing a broken session.

Use current help to confirm command shapes. These examples show session and evidence scoping, not a fixed acceptance test:

```sh
browser-use --session "$session" open "$bb_url"
browser-use --session "$session" wait selector "$selector"
browser-use --session "$session" state > "$evidence_dir/state.txt"
# Read the saved state, then use its current index for the intended action.
browser-use --session "$session" click "$index"
browser-use --session "$session" screenshot "$evidence_dir/result.png"
browser-use --session "$session" close
```

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
