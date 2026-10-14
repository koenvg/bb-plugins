# Live Output

Open **Live Output** in BB's navigation rail to watch observed output across threads. The graph covers the last ten complete minutes. It starts with a thirty-second average and estimated tokens per second. Use the controls to select raw one-second buckets or UTF-8 bytes per second. Select a contributor's title to open its BB thread.

Hover over the chart to see the local date, time and rate for a complete-second point. The floating tooltip follows the selected raw or thirty-second average and token or byte unit. Escape clears a visible tooltip without moving the pointer or focus. Focus the chart and use Left/Right to step or Home/End to reach the edges. Axis labels keep their text size when the plot changes width. Selected times stay fixed as updates arrive. Startup padding is not measured output, and inspection is unavailable while disconnected.

The gauge button in the sidebar footer shows the current thirty-second average in estimated tokens/s. Select it to open Live Output. A dash means the rate is not yet available or the connection is stale. The label and accessible description state that these are estimates. The footer uses the same public snapshot RPC as the page, with one shared, bounded one-second poll per app window while the page or an attached footer is mounted. The last consumer stops polling and clears the cached snapshot.

## What it counts

Only streamed agent-message deltas and visible reasoning text deltas contribute. Estimated output tokens are UTF-8 delta bytes divided by four, not tokenizer or billing data. Input, cache, hidden reasoning, tool output, reasoning summaries, completed-message replay and tool-call generation are excluded.

Collection starts when the plugin loads. Earlier events never contribute, including those in threads found later. Reloading or disabling the plugin clears all observations. Counts stay in memory. The plugin does not store transcript bodies, write telemetry, add agent tools or change providers.

Thread discovery spans projects and includes hidden and archived threads. Main and child BB labels come from `parentThreadId`. A provider ID names the backend, not an agent role. "Threads streaming" means threads with observed output in the last five complete seconds, not every active provider runtime.

Smoothed rates use thirty complete buckets with a fixed divisor of thirty. Missing startup buckets count as zero. Contributors remain eligible for sixty seconds. Streaming status uses five seconds, independently of the ten-minute graph. Deleting a thread removes its graph contributions but preserves lifetime totals.

## Limits

Rates use BB's stored event timestamps. The public event notification is coalesced at most once per second, and only complete buckets appear. Providers can delay or batch deltas. The graph measures observed output timing, not exact generation speed.

The collector reads at most one discovery page per work cycle. Event reads and identity checks share at most twenty serial starts per cycle and per rolling second. Live hints have priority, with one of five eligible starts reserved for background work and unused capacity available to either lane. A missing discovery row keeps its cursor until a direct identity read confirms deletion. A deletion notification invalidates any discovery page already in flight. Discovery repeats thirty seconds after a completed sweep, without requeueing unchanged threads. Cold idle threads baseline lazily on their first output hint or verification read.

Rolling event verification starts after ten minutes and spreads a fixed set of threads across service ticks. It does not restart an unfinished scan. Drained reads defer that thread's next verification by ten minutes. This is not an exact per-thread deadline. SDK delays, retries and queue load can extend the interval. A failed member does not stop other members. Discovery pagination is not an atomic snapshot, so concurrent list changes can take another sweep to repair.

Memory is limited to 10,000 tracked threads, at most 635 second buckets per thread and ten displayed contributors. The page reports degraded coverage for a capacity limit, pending catch-up or read errors. Starting means initial discovery is incomplete. Idle means collection is live but recent output is zero. Disconnected means the page's connection or snapshot is stale; the last graph is not current evidence.

## Compatibility and local install

Targets BB 0.46 and the public `@get-bb/plugin-sdk` 0.6.37 contract. The manifest requires SDK `>=0.6.37 <0.7`. The experimental thread-event hook must be available.

Use Bun 1.4.3 and Node 24.15 or newer within Node 24 for Vitest. From this directory:

```sh
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run lint
bun run format:check
bun run build
bb plugin install .
```

Install the root repository tools before lint or formatting checks. Local installation runs trusted plugin code. The build needs the BB CLI but no running server. Tests use the public SDK backend and frontend harnesses. They do not prove installed navigation layout, live provider timing, theme rendering or reconnect behavior in the real app. Check those after installation.
