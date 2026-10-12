# Design

## Context

See `proposal.md` for motivation. The previous design added an SDK composer banner. The user rejected duplicate UI and approved a temporary content-script workaround on the existing native bar instead. Transcript indicators remain out of scope.

`app.tsx` already registers the Subagents panel. `src/ui/subagents-panel.tsx` reads the newest 64 qualified extension-state events through the public SDK, restores bounded captures, refreshes every four seconds, and guards teardown and thread changes. `SubagentsView` defaults to the first restored row; targeting a matched background root requires panel-parameter support. Background observations contain both a native run ID and a full presentation-row ID scoped to the Pi session and owning path.

Read-only inspection of installed BB 0.45.0's `ThreadDetailView-D2XowauQ.js` shows distinct native composer card shapes. A wide singleton uses a noninteractive div with an agent description in its accessible label. Aggregate and narrow layouts use the existing `thread-background-commands-card-toggle` button and `thread-background-commands-card-body` disclosure. The agent-only card is labeled `Background agents`; command-only and mixed cards have different labels. Descriptions contain the fork's run identity. These are observed private DOM details, not a supported SDK interface.

SDK 0.6.15 supports content-script lifecycle registration and panel navigation, but its content-script mount context does not supply `useBbNavigate` or current thread context. The GitHub plugin demonstrates separate trusted content scripts and a thread-bound React panel-navigation receiver. Use that separation without its visible banner, CSS hiding, persistent pending intent, or automatic replay.

## Goals / Non-Goals

**Goals:**

- Confine private DOM knowledge to one small adapter with fixture tests for the observed native shapes.
- Resolve native descriptions to validated full row targets in the current thread, then use normal SDK panel navigation.
- Restore host-owned elements when ownership, thread context, or plugin lifecycle changes.

**Non-Goals:**

- A second visible bar, replacement markup, hidden native work, or navigation from transcript rows.
- A new live-activity counter, backend protocol, global event bus, or recovery queue.
- BB core/SDK changes, guessed targets, agent commands, new dependencies, or settings.

## Decisions

### Decorate only recognized native composer bars

Register one `app.contentScripts.register` adapter. Keep its native selectors and shape checks together. Limit candidate matching to the observed background-agent composer card and its singleton or disclosure header, not a global search for `Running background agent` text. Use run identities from validated current-thread background roots as corroboration; labels alone are not ownership proof.

For a wide singleton, resolve its exposed run identity to exactly one captured background root. Aggregate and narrow headers open the overview without selecting a run. BB initially leaves the disclosure body empty, so these headers need not expose every run ID. Require the tested agent-only card shape, one unambiguous thread-scoped SDK receiver, the `pi-subagents` composer provider selection, and available qualified background observations. Check exposed descriptions against those observations when present; do not infer a target from the displayed count. A positive native count identifies the tested narrow shape, not run ownership or lifecycle. Do not bind command-only, mixed, unrelated, ambiguous, or unknown shapes. Missing observations or another selected provider keep the native UI untouched.

Keep original text, icons, duration, layout, and native handlers. A matched native button already handles keyboard activation; add one navigation listener to its click path and retain native expand/collapse behavior. For the matched singleton div, add only the role, focusability, accessible navigation hint, and Enter/Space handling needed for button behavior. Prevent Space scrolling for that noninteractive shape, but do not suppress native disclosure actions. Add scoped cursor/focus styling only to owned matches. Do not wrap, replace, hide, or inject a visible element.

Observe bar replacement and relevant identity changes, reconcile bindings idempotently, and recheck the match on activation. Ignore elapsed-time text updates as a reason to rebuild bindings. Dispose detached or no-longer-matching targets. Record attributes the adapter owns; restore only its own changes without overwriting later host updates. Disconnect the observer, remove listeners and scoped style nodes, and clear bindings when the SDK context disappears or the content-script generation aborts.

### Supply SDK context without a visible banner

Use a thread-scoped, bare composer customization whose React controller returns `null`. Its only job is to obtain `useComposer`, `useSdk`, and `useBbNavigate`, and bind current-thread background observations and the SDK opener to the adapter through a small module-local callback registration. It must produce no visible content, border, or extra spacing. This is a navigation-context receiver, not the rejected banner.

The adapter's interface needs only a lifecycle mount and a disposable current-thread binding. Keep matching, decoration, and listener bookkeeping inside it. Do not expose DOM selectors to the panel or add a generic event bus. Invalidate a binding when its thread or owner changes; an older controller's disposal must not remove a newer binding. Requests are handled immediately against the current binding, with no stored intent, delayed replay, or retry.

Reuse the panel's bounded event-reader effect through a small thread-scoped hook consumed by the controller and panel. Preserve qualified-kind filtering, validation, `restoreViewHistory`, the 64-event window, four-second refresh, error handling, and abort/closed guards. Do not add a cache system or turn UI observations into native lifecycle authority. If required ownership data is unavailable, stop decorating rather than broaden matching.
Treat a full history window as a panel notice, not a read or validation error. The window can contain a supported latest snapshot with a uniquely owned current root. Only actual read/validation failures and unavailable ownership block the native receiver; preserve the 64-event limit and fail-closed identity checks.

A visible SDK banner is rejected because it duplicates the native bar. Calling private BB panel functions directly is also rejected. The null-rendering SDK receiver keeps navigation supported while accepting private DOM matching only in the adapter.

### Open the matched root through public panel parameters

Call `useBbNavigate().openThreadPanel({ actionId: "subagents", params: { rowId } })` using the validated full row ID, not arbitrary text from the DOM. The SDK owns tab opening and same-target reuse. The native run ID identifies a candidate; only a root present in this thread's validated observations supplies the panel target.
For aggregate and narrow bars, use stable `params: { overview: true }`. The panel starts with no selected row and asks the user to choose a captured run. Manual row selection survives refresh. Both collapsed and expanded versions use the same overview parameters, so native disclosure changes do not open sibling tabs. Manual panel entry without parameters retains its existing default-selection behavior.

Validate panel parameters as bounded untrusted JSON, then match the requested full row ID after the panel's history read completes. Preserve initial loading and manual panel-open behavior. Apply a new target when it changes; do not override manual row selection on each refresh. If the target is absent, show an explicit unavailable notice and retain the other captured rows without presenting another row as the requested one.

If the SDK declines navigation, leave native handlers active, log the failure, and expose a short failure/manual-access hint through the existing target's tooltip/accessibility description. Add no error bar, modal, alternate route, automatic retry, or agent request. Cleanup restores the adapter's owned hint like its other attributes.

### Keep native lifecycle and the pending capability separate

The adapter does not decide when BB displays or removes its bar. Do not change `skipTranscript`, background-task identity, native counts, parent turn boundaries, capture, or completion delivery. Completed output remains available through manual Subagents access.

Reuse the pending `pi-subagents-observability` capability path with distinct ADDED requirements. Preserve the original provider change's other requirements during future archive integration. This UI acceptance does not establish idle retention or parent wake.

## Risks / Trade-offs

- BB can change private DOM details. Test only observed shapes, leave unknown shapes untouched, document the tested version, and retain manual access. A future SDK panel-target hook is a separate possible change, not part of this workaround.
- Native aggregate headers already toggle their disclosure. Preserve that handler while adding navigation, and test both effects without duplicate keyboard activation.
- Native elements can be reused for different work or threads. Revalidate ownership on activation and remove bindings on thread changes, replacement, and lost matches.
- A null-rendering SDK receiver might still receive host spacing. Verify zero visible footprint through SDK fixtures and installed layout acceptance; do not claim the no-extra-UI requirement from a controller returning null alone.
- Local DOM fixtures cannot prove installed compatibility. Require an approved installed check, or report it blocked. Never claim this is an SDK-only or upgrade-stable solution.

## Migration Plan

No data migration or persisted-state version change is needed. Implement only frontend registration, the bounded DOM/navigation adapter, reader reuse, panel targeting, and their tests/documentation. Run focused tests, the package suite, typecheck, the read-only SDK compatibility gate, and build. Record the DOM fixture source and BB/SDK versions.

Install or reload only with separate approval. Verify the existing native bar opens the correct panel through click, Enter, and Space with no extra bar or spacing, unchanged transcript behavior, preserved disclosure actions and parent draft, and no agent turn. Confirm disable/reload restores native behavior. Use owned observations where possible; new live child execution requires separate approval.

Rollback restores the prior approved plugin build and removes only adapter-owned decorations. Leave thread history, task records, provider settings, and Pi session files unchanged.
