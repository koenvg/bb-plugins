# Live Output

Open **Live Output** in BB's navigation rail to watch observed output across threads. The graph covers the last sixty complete seconds. It starts with a five-second average and estimated tokens per second. Use the controls to select raw one-second buckets or UTF-8 bytes per second. Select a contributor's title to open its BB thread.

## What it counts

Only streamed agent-message deltas and visible reasoning text deltas contribute. Estimated output tokens are UTF-8 delta bytes divided by four, not tokenizer or billing data. Input, cache, hidden reasoning, tool output, reasoning summaries, completed-message replay and tool-call generation are excluded.

Collection starts when the plugin loads. Earlier events never contribute, including those in threads found later. Reloading or disabling the plugin clears all observations. Counts stay in memory. The plugin does not store transcript bodies, write telemetry, add agent tools or change providers.

Thread discovery spans projects and includes hidden and archived threads. Main and child BB labels come from `parentThreadId`. A provider ID names the backend, not an agent role. "Threads streaming" means threads with observed output in the last five complete seconds, not every active provider runtime.

## Limits

Rates use BB's stored event timestamps. The public event notification is coalesced at most once per second, and only complete buckets appear. Providers can delay or batch deltas. The graph measures observed output timing, not exact generation speed.

The collector reads one discovery page and at most twenty thread pages per second. Event reads and identity checks share a fair queue. A missing discovery row keeps its cursor until a direct identity read confirms deletion. A deletion notification invalidates any discovery page already in flight. It reconciles discovery and known cursors every thirty seconds after a completed sweep. Cold idle threads baseline lazily on their first output hint. Discovery pagination is not an atomic snapshot, so concurrent list changes can take another sweep to repair.

Memory is limited to 10,000 tracked threads, about seventy second buckets per thread and ten displayed contributors. The page reports degraded coverage for a capacity limit, pending catch-up or read errors. Starting means initial discovery is incomplete. Idle means collection is live but recent output is zero. Disconnected means the page's connection or snapshot is stale; the last graph is not current evidence.

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
