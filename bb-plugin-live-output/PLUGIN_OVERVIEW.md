## Watch all-thread output

Open Live Output from the native BB navigation rail. A ten-minute graph shows observed output across projects, including hidden and archived threads. Start with the thirty-second average, or select raw one-second buckets to inspect bursts. Switch between exact UTF-8 delta bytes and estimated output tokens per second.

Recent contributors show readable thread titles, provider IDs and main or child BB hierarchy. Select a title to open that thread. Starting, live, idle, degraded and disconnected states report collection and connection limits.

## Measurement limits

Estimated tokens equal output delta bytes divided by four. These are observed output estimates, not billing counts. Only streamed agent messages and visible reasoning text contribute. Input, cache, hidden reasoning, tools, reasoning summaries, completed-message replay and tool-call generation are excluded. Provider batching and BB event timestamps affect timing.

Counts stay in memory and reset when the plugin reloads. No transcript bodies or telemetry are saved. Collection excludes output before startup, reconciles missed notifications, and reports incomplete coverage for read errors, catch-up or the 10,000-thread memory limit.

## Requirements

Requires BB 0.46 and Plugin SDK 0.6.37 with the public experimental thread-event hook. No account, external service, chart package or agent tool is needed.
