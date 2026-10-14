# Design

## Context

See [proposal.md](proposal.md) for the requested outcome and scope. The target is the existing `bb-plugin-pi-subagents-provider` panel, not BB's parent conversation or standalone Pi.

The current `SubagentsView` already orders nested rows, supports keyboard selection, and distinguishes default selection, a validated background-root target, and an overview without selection. Its message and final-output bodies are raw `<pre>` blocks. `useSubagentsHistory` reads at most 64 qualified extension-state events, refreshes every four seconds, aborts on disposal, and rejects late cross-thread results. `restoreViewHistory` retains accepted captures within that window.

The current contract permits 128 rows and 256 KiB of persisted version-1 state. Captures permit a 2,000-character task, 8,000-character final output, and 20 entries with 1,000-character text. These limits and existing correlation guards remain in force.

### Approved visual reference

- [Interactive prototype](../../../verification/prototypes/subagent-viewer/index.html)
- [Desktop, light](../../../verification/prototypes/subagent-viewer/desktop-light.png)
- [Panel, dark](../../../verification/prototypes/subagent-viewer/panel-dark.png)
- [Coarse-pointer layout](../../../verification/prototypes/subagent-viewer/touch-targets.png)
- [Expanded capture details](../../../verification/prototypes/subagent-viewer/capture-details.png)
- [Additional states and evidence](../../../verification/prototypes/subagent-viewer/README.md)

Koen approved this polished prototype on 2026-10-12 in `bbthread://thr_tyvtiyrnpp`: "Looks amazing go and impliment this". The independent Polish reviewer approved the standalone prototype without findings. Its evidence records 161 assertions, 40 original layout cases, and 64 adaptation cases. That approval does not establish installed functionality or approval of the eventual working panel. Keep the reviewed visual artifacts with the change for cross-machine review; do not ship the illustrative data or prototype controls in the plugin.

## Goals / Non-Goals

**Goals:**

- Implement the approved hierarchy using public host message rendering and plugin-owned run selection, metadata, and capture disclosures.
- Enrich capture data only from already-attributed, supported child records while keeping old history readable.
- Preserve reading state and native navigation through ordinary history updates.

**Non-Goals:**

- BB child-thread creation, synthetic thread events, private host component imports, or a replacement parent renderer.
- A new Markdown parser, dependency, SDK pin, framework, theme, provider identity, or upstream package modification.
- New execution controls, capture retry policy, timers implying live progress, unbounded history, or fixes to installed lifecycle acceptance.
- Child-file scanning, arbitrary artifact-path fallback, requested-model inference, or fabricated tool timing and call/result pairing.

## Decisions

### 1. Reuse the public message body renderer

SDK 0.6.37 exports `Markdown` with `content` and optional `className`. Its `MarkdownProps` declaration describes the same typography, spacing, and code styling as timeline messages. Use it for captured task, text blocks, and final output. Preserve task attribution, assistant role labels, and the final-output marker in the plugin's conversation wrapper. Use escaped text for tool input/output detail, not raw HTML.

`ThreadChat` requires a real BB `threadId` and does not accept captured message arrays. Creating child threads or feeding the parent thread into it would change ownership and violate read-only capture semantics. Therefore reuse `Markdown`, not the complete thread component or private timeline rows. Do not assign a guessed child workspace to its optional document-routing props. Host-owned links retain host routing.

Keep view logic in the current UI layer. If extraction makes the implementation smaller, use a local captured-conversation component taking one validated row; do not introduce a generic conversation framework or expose SDK history internals to it. Follow `DESIGN.md` and the active host theme rather than copying the prototype's literal palette. Compare body rendering against the normal thread in light, dark, and Codex-inspired themes.

### 2. Add bounded optional capture metadata

Extend the existing capture schema with an optional resolved-model record containing provider ID, model ID, and the time that the adapter captured those values. Suggested limits are 160 characters for provider and 256 for model ID, using the existing timestamp bounds. The source is the latest supported assistant record in an already-attributed foreground child's messages. Its actual provider/model pair is evidence; a result's configured `model` option, parent selection, or decorated status string is not. Persist only the allowlisted values, not a model configuration object.

Keep model metadata attached to the capture, with its own capture time so later history merges cannot make an older model look newly observed. Label it as the captured model, not a live execution promise. Workflow containers without their own assistant evidence remain unavailable rather than borrowing a descendant model.

The installed `pi-subagents` 0.77.0 `InspectReply` declares optional message `name` and `isError`; the current adapter drops both. Retain bounded tool names and boolean error flags through inspection normalization, persisted schema, and rendering. Individual tool durations are not published by this reply and remain unavailable.

The current background snapshot node and inspection reply have no resolved-model field. Do not claim this change supplies models for those captures. Foreground child assistant records are the concrete supported enrichment path; background records retain explicit unavailability. Supporting another authoritative model source later would require a separate, verified contract change.

Do not bump state version 1 for these optional additions. Existing readers ignore unknown fields, and new readers accept captures without enrichment. Preserve the registered extension kind and whole-state byte and row budgets.

### 3. Preserve block order before enforcing the display budget

Foreground normalization currently flattens text and tool-call names into one text entry. Normalize supported text, tool-call, and tool-result blocks separately in original order. Retain available names and error flags, then enforce the 20-entry limit and account for newly omitted entries. Keep existing source omissions and text-clipping flags truthful; do not double-count them.

Old entries without tool names remain readable with generic tool labels. Do not merge a call and result by matching their name or adjacency. An individual tool error labels that tool record and does not override the authoritative run outcome.

### 4. Use two recoverable scrolling levels

Use a bounded panel layout with the run picker above the selected identity/metadata and conversation. The conversation has its own scroll area with a 200 CSS-pixel minimum. The outer panel can scroll when headers, notices, or enlarged text exceed the available height. Put capture details inside the conversation scroll area so expansion cannot consume the reading viewport.

Retain all notices rather than hide them to fit a short panel. Wrap controls, long model IDs, labels, and errors; contain wide code and tool output locally. Keep desktop controls compact and provide 44-pixel coarse-pointer targets and 16-pixel primary text. Use native disclosures or equivalent accessible controls, with consistent expanded arrows and reduced-motion behavior.

The prototype's View, Data, theme toggle, sample-parent panel, and sample-data notice are demonstration controls. They do not become production controls. BB continues to own the parent pane and theme selection.

### 5. Keep selection and reading state independent of capture timestamps

Preserve the current root-target, overview, invalid-target, and missing-target behavior in `SubagentsPanel` and `SubagentsView`. A thread change resets view state through the existing thread key and history cancellation. A same-run action must not remount the conversation. Do not key it by observation time or capture attempt time.

Keep selection visible during keyboard navigation and expose its pressed state. Unchanged conversation content retains tool disclosure state and scroll position across polling. Do not transfer disclosure state to a different record merely because it occupies the same array index after a bounded tail changes. A different run starts its own selected conversation; no cross-run position-history feature is required.

The final-output control is available only for captured output. It scrolls to and focuses the final-output section. Ordinary polling does not steal focus or force a final-output jump. Capture metadata and failed-attempt information remain associated with the correct accepted content.

### 6. Extend the existing capability without changing native work

Add viewer requirements to `pi-subagents-observability`. Its main spec currently describes composer navigation; the in-flight `pi-subagents-provider` change also contains baseline capture requirements. Preserve both sets. This delta adds the approved reading and enrichment behavior, without replacing either change or weakening lifecycle gates.

Keep the current observer, inspection queue, refresh cadence, session/request correlation, native background events, and completion delivery. Change history merging only where required to retain enriched metadata with its correct capture time.

## Risks / Trade-offs

- [Background model data is absent] → Display explicit unavailability. Do not add a private filesystem or parent-model fallback.
- [Optional fields increase bounded payload size] → Enforce existing state budgets and capture limits after normalization; report omissions instead of widening the limits.
- [Polling or tail replacement can reset reading state] → Use stable run/content identity and test same-run selection, metadata-only refresh, and changed bounded tails at public UI boundaries.
- [Native host rendering can differ from a standalone preview] → Compare the built panel against the approved captures and the normal host thread. Keep host typography and theme behavior; obtain approval of the working UI.
- [Installed verification may lack a compatible runtime or approval] → Keep it blocked and separate from source passes. `COMPATIBILITY.md` targets BB 0.46.x and records an incompatible historical installed build; no old SDK diagnostic exception applies to the current target.

## Migration Plan

1. Apply optional schema and normalization changes with old/new capture fixtures. Verify history restoration, correlation rejection, bounded payloads, and ordinary bridge behavior.
2. Implement the panel and inspect an early working preview. Update the affected UI tests using the published SDK frontend harness, not private renderer mocks.
3. Run package tests, type checking, the normal SDK declaration check, formatting/lint checks, and the production build. Compare settled browser behavior against the prototype's layout/adaptation cases.
4. Run one independent read-only review of the complete implementation, including capture safeguards. Resolve blockers and rerun affected checks.
5. Before installed checks, follow the repository verify skill. Confirm runtime compatibility and changed-checkout identity. Obtain separate approval for a source switch, enablement, authenticated dedicated browser use, or model-backed test work when required. Do not treat prototype-tab ownership as installed-browser approval.
6. Verify supported real captures, retained history after refresh, composer root/overview navigation, unchanged parent draft, read-only actions, and the actual host rendering. Report unavailable prerequisites as blocked. Get Koen's approval of the working UI before marking implementation complete.
7. For an approved rollback, restore the prior plugin source through the normal installation process without deleting settings or event history. Older version-1 readers can still read the original fields and ignore enrichment. Preserve the reviewed visuals with the change when committing; remove temporary visuals and links at archive by default, retaining approval and decisions in text.
