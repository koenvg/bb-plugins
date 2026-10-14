# Proposal

## Why

The current Subagents panel shows captured messages as raw monospace blocks, which makes child conversations harder to read than normal BB threads. Koen approved an interactive prototype with a run list above the conversation and clearer model, execution state, and duration information.

## What Changes

- Implement the [approved prototype](../../../verification/prototypes/subagent-viewer/index.html) in the existing Pi with subagents right-hand panel. Keep the run list above the selected conversation, including nested and foreground children.
- Reuse the public SDK `Markdown` component for task, assistant text, and final output. Keep tool calls and results collapsed by default, with readable, escaped detail. Do not create BB child threads to use `ThreadChat`.
- Make model, execution state, and elapsed or total duration easy to scan. Capture the resolved model from attributed child assistant messages where available. Show unavailable values explicitly; never infer a child model from the parent or treat missing time as zero.
- Preserve inspection-provided tool names and error flags that the current capture adapter drops. Do not invent tool durations or pair records without a supported identity.
- Keep execution outcome separate from capture availability. Retain capture times, failed-attempt times, truncation notices, omission counts, and previously accepted content.
- Preserve keyboard selection and reading state. Provide a final-output jump when output is captured. Keep the transcript reachable in narrow and short panels, enlarged text, and coarse-pointer use.
- Keep the viewer read-only and preserve existing composer-bar navigation, ordinary Pi work, parent drafts, native activity accounting, and completion delivery.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `pi-subagents-observability`: Add thread-style captured conversation rendering, truthful prominent metadata, compatible capture enrichment, retained reading state, and responsive accessibility requirements. Existing composer-navigation requirements remain unchanged.

## Impact

- Target package: `bb-plugin-pi-subagents-provider`.
- Main files: `src/ui/subagents-view.tsx`, `subagents.css`, `subagents-panel.tsx`, `src/subagents-contract.ts`, `src/bridge/subagents/foreground.ts`, and `capture.ts`. Update bounded history handling only where enrichment requires it.
- Extend persisted version-1 data with bounded optional fields. Existing captures remain readable. Reuse SDK 0.6.37; no dependency, SDK, engine, BB core, or upstream Pi/package changes are planned.
- The current background snapshot and inspection protocols do not expose a resolved child model. Those captures will display model unavailability. Existing foreground child assistant records can supply actual provider/model values.
- Add source contract, capture, history, and UI coverage, then validate the working panel against the approved visuals and applicable installed-verification safeguards. Prototype checks are not proof of installed behavior.
- Koen approved the polished prototype in thread `thr_tyvtiyrnpp` on 2026-10-12: "Looks amazing go and impliment this". This OpenSpec request creates planning artifacts only. Apply, working-UI acceptance, and installation remain separate steps.
