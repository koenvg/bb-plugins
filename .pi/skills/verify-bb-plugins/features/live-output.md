# Observed streamed output

Users see recent streamed output across threads and inspect estimated token or UTF-8 byte rates without reading stored transcript bodies.

## Sub-features

- output-entry: navigation page and sidebar-footer gauge.
- output-controls: raw one-second versus thirty-second average; tokens versus bytes.
- output-inspect: pointer/keyboard chart inspection and contributor navigation.
- output-state: starting, idle, degraded and disconnected states.

## How to get to it (user POV)

- Choose Live Output in the navigation rail.
- Choose its gauge in the sidebar footer to open the same page.
- Focus the chart and use Left/Right or Home/End; Escape clears the tooltip.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-live-output/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

For the local browser fixture, run `bun --no-install run --cwd bb-plugin-live-output test:browser` from the repository root. Set `LIVE_OUTPUT_EVIDENCE` to a new directory outside the checkout. The package runner bundles the synthetic page and owns the ephemeral loopback server. It defaults to Playwright's pinned full Chromium and supports `PLAYWRIGHT_CHROMIUM_EXECUTABLE` as described in the [package README](../../../../bb-plugin-live-output/README.md#live-output-browser-check). Retain `browser-command.json` for the selected path and the Playwright results for the `browser-version` attachment from the running browser. This proves fixture behavior only, not installed BB acceptance.
Run package tests/typecheck and applicable lint/format checks; controlled SDK tests are not a live stream proof. Installed Doctor requires exact source/activation and a current snapshot; a dash or disconnected graph is not zero output. Use the installed workflow to open Live Output through both navigation and footer. Change averaging/unit controls, focus the chart and inspect a complete-second point by keyboard. Capture the initiating action, selected time/rate and descriptive estimate label. Use an existing approved active stream when available; creating a stream or agent just to test it requires approval. Correlate bounded observed deltas with graph buckets and contributor labels. Select a contributor and confirm its actual thread ID, without sending anything.

## Gotchas

- Estimated tokens are UTF-8 delta bytes divided by four, not billing or tokenizer totals.
- Collection starts on plugin activation and resets on reload; do not reload simply to manufacture a zero baseline.
- Only complete buckets are shown. Startup padding is not observed output.
- Hidden/archived threads can contribute. Do not share private titles or transcript material in evidence.
