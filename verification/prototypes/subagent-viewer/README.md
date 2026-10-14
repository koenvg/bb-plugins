# Subagent viewer prototype

Open [the interactive prototype](index.html). It is self-contained and makes no network requests.

## Agreed direction

Koen approved the direction in thread `thr_tyvtiyrnpp`: a read-only, thread-style viewer with the run list above the selected conversation, visible model/status/elapsed time, collapsed tool calls, and clear missing-data labels. This approval permits a prototype only. The finished visual design is not yet approved.

## Try it

- Select each of the four sample runs. They cover complete, running-at-capture, failed execution, and complete execution with an incomplete capture.
- Use arrow keys, Home, and End in the run list.
- Expand a tool call, jump to captured final output, or collapse Runs for more reading space.
- Use View to compare the workspace, wider panel, and panel-only layout.
- Use Data for loading, empty, and capture-error states. Capture errors retain the selected run's previous content.
- Switch between light and dark themes.

All tasks, transcripts, model names, durations, and tool results are illustrative. The prototype does not control agents, refresh live captures, or change the installed viewer.

## Implementation limits

- The sample parent and child share one conversation-rendering function. This demonstrates a common reading experience, not reuse of BB's actual native renderer. Its availability through the plugin SDK has not been verified.
- `bb-plugin-pi-subagents-provider/src/subagents-contract.ts` exposes duration/start/end/observation times, but no model field in `ViewRow`. Production work must capture the child's resolved model rather than infer it from the parent.
- Existing captured messages have role, text/tool kind, bounded text, and truncation flags. They do not expose the structured tool-call names/durations shown in these samples. Production rendering must use supported data and retain capture/truncation notices.
- Running elapsed time means elapsed at the captured observation. It does not imply a live feed. Missing duration is not zero. Missing final output does not change known execution status.
- Neutral/status colors here are standalone preview values. Production UI must inherit host theme tokens. No runtime, provider, dependency, or build configuration changed.

## Verification

Baseline: `833199870c3081ba69354378cd2a53895508947e`. The worktree was clean before this work.

Browser checks passed, including native keyboard events, selection visibility, tool disclosure, missing values, execution/capture failure separation, retained content, loading/empty states, and sample-text escaping. The settled run passed 161 assertions. Forty viewport/state/run combinations, including expanded capture details, at 1280, 820, 520, 390, and 320 pixels had no horizontal page/transcript overflow and left at least 100 pixels for the transcript. Results are in [browser-results.json](browser-results.json).
JavaScript and Python syntax checks passed. Measured light/dark foreground, muted, and state-text contrast against the preview surfaces was at least 4.71:1. `git diff --check` passed.
The independent reviewer found that expanded capture details displaced the conversation at 320×700. The new regression check reproduced a 42px transcript viewport. Capture details now sit inside the transcript scroll area. All 30 captured/error layout cases verify that expanding them leaves the transcript height unchanged. This resolves the review finding; it is not user approval or live integration verification.
The Adapt and Harden pass fixes the audit's three issues. The outer viewer can scroll when headers do not fit, while the transcript keeps a 200px reading area. Coarse-pointer controls have 44px minimum targets and 16px control/conversation text. Narrow run metadata stacks without removing model or timing. The Dark theme toggle keeps a stable accessible name and an accurate pressed state.

The new browser matrix covers 64 short-window, 200% CSS text-scaling, fine-pointer, and coarse-pointer cases, with Runs open/closed and expanded capture details. It checks the actual emulated pointer mode, horizontal clipping, and a reachable reading area. A native End-key check passes in the visible task tab. Hidden-tab default keyboard scrolling did not run, so the validator requires its task-owned tab to be visible for that check. No successful physical or synthesized touch gesture is claimed; the audit's touch-tool timeout remains a verification limit.
The independent Adapt/Harden review approved this standalone prototype with no blocking findings. It checked the three baseline diffs, current source, seven screenshots, syntax, and evidence consistency. User approval of the visual result and live BB implementation remain separate.
The Polish pass keeps the reviewed layout and content unchanged. Reselecting the current run now preserves the transcript reading position and open tool details. Capture, tool, and run disclosures share the correct expanded-arrow treatment. Regression checks cover both fixes and monitor runtime errors during the core interaction path. The retained 40 layout and 64 adaptation cases still pass. No current critique snapshot was available; the helper returned exit 2, so no snapshot was closed.

Captures:
- [Desktop, light](desktop-light.png)
- [Panel, dark](panel-dark.png)
- [Narrow, incomplete capture](narrow-incomplete.png)
- [Narrow, capture error](narrow-error.png)
- [Landscape reading area](landscape.png)
- [200% text scaling](large-text.png)
- [Coarse-pointer targets](touch-targets.png)
- [Expanded capture details](capture-details.png)

Impeccable's mechanical detector reported metadata-size and code-radius advisories. Body copy is 13px. The 11px metadata matches the incumbent compact BB metadata convention recorded in DESIGN.md. Inline code uses a 3px radius, half of the 6px control radius. These are preview choices, not design-system changes.

To rerun from the repository root, create a task-owned browser tab, then pass its target ID:

```sh
PROTOTYPE_TARGET=<task-owned-target-id> browser-use < verification/prototypes/subagent-viewer/validate-browser.py
```

The script navigates only that tab, writes screenshots/results beside this file, and resets viewport emulation after a successful run. It leaves the task tab open for review.

Production package tests and live BB integration were not run because this change contains only prototype and verification artifacts. No cleanup follow-ups were identified outside the requested viewer work.
