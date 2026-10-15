# Subagents reader verification

## Scope

The reader uses captured task text as the main run label. Original agent labels remain visible, and full IDs stay in Capture details. Completed captures show the result first. Native Runs, Task and Conversation disclosures keep secondary content available.

Host colors mark selection, focus and execution state. A pre-commit reading snapshot preserves the visible anchor when a notice changes the reader's position. Capture, runtime, composer, schema and dependency behavior are outside this change.

The branch preserves the existing legacy tool-result disclosure behavior from `main`.

## Automated checks

From `bb-plugin-pi-subagents-provider`:

```sh
bun run test --maxWorkers=2
bun run typecheck
bun run build
bun verification/build-viewer-preview.mjs
```

The final integrated test run passed 606 tests in 57 files. Typecheck, production and preview builds, scoped Oxc lint and formatting, and whitespace checks passed.

## Recorded browser checks

Before integration with the latest `main`, controlled source fixtures reproduced a 50px reading jump on desktop and mobile and a 113px jump in a narrow panel. The repair reduced each jump to 0px without hiding the notice. Unfocused reading and native bottom clamping also retained the anchor.

One real installed live probe then reproduced the native-accounting notice. The reader moved down 50px, scrollTop compensated by 50px, and the focused reading line moved 0px throughout the notice. Across 533 samples, maximum anchor movement was 0.265625px. Reader, tool, Conversation and selected-button nodes, focus and tool disclosure state remained stable. All 52 event polls returned HTTP 200.

That installed run preceded integration of `main`'s newer legacy tool-result rendering change. The final integrated source has fresh automated checks, but no repeated installed live run is claimed.

## Limits

The broader strict collector did not pass. A historical Task attribution disappeared during refresh, and the browser emitted ResizeObserver notifications. The same notification also occurred with the original provider restored and no viewer mounted. BBP-243 and BBP-242 track these investigations. Neither cause is attributed to the reading-position repair.

Other host themes, physical touch, screen readers and native browser zoom retain their verification gaps. Raw captures, screenshots, local paths and operational records stay outside the public pull request. The original workspace provider was restored, all pre-existing native tabs were preserved, and the isolated browser was closed.
