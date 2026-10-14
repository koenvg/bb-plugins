# Independent source review

This is the original review's findings and limits, without private run/session metadata. Its verdict was changes required. The sole P2 blocker was subsequently fixed by replaying history oldest-to-newest while preserving newest-first row metadata and order, with older-failed and older-successful capture regressions. Source validation passed after the fix. The later presentation refinement did not change capture/lifecycle safeguards; no second independent review was run.

## Original report excerpt

## Summary

delegate:

## Verdict: changes required

One source blocker. Installed acceptance remains separate and pending.

### P2: history restoration changes the accepted capture time

**Evidence:** `bb-plugin-pi-subagents-provider/src/capture-history.ts:31–34`, called by `src/view-history.ts:31–32`.

The helper always replaces a failed capture's `capturedAt` with the older event's time. History restoration repeats this for every older event.

Reproduced sequence:

- Capture fails at 3.
- Capture succeeds at 10.
- Capture fails at 12, retaining output and capture time 10.
- History restoration returns the retained output with **capture time 3**, which was a failed attempt.

The regression assertion failed with `actual: 3, expected: 10`. An older successful capture also incorrectly replaces the newer accepted time.

**Smallest justified fix:** merge each row's captures oldest-to-newest, matching live-store updates. Keep newest row metadata, selection, bounds, and correlation unchanged. Add three-event regression tests for both older failed and older successful captures.

No other blocking structural or safeguard findings. The shared capture helper earns its place, but its merge policy does not fit the current reverse traversal.

## Acceptance limits

Reviewed the supplied source logs and browser evidence. No installed checks or browser actions ran. Native Markdown/theme fidelity, installed persistence/navigation/lifecycle checks, and working-UI approval remain pending. These are acceptance gaps, not observed product failures.
