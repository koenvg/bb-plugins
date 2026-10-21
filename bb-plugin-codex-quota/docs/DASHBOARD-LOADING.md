# Saved dashboard loading

The dashboard requests last-known summaries and live reports independently. Saved totals keep their observation time and last-known label. Live results replace them. A missing or slow saved response does not delay a cold live read.

The existing machine coordinator and persistent summary cache own both reads. There is no browser cache or detached refresh job. Final publication checks exclude rows invalidated while another machine is still pending.

## Controlled benchmark

The public coordinator's warm-display median changed from **812.25 ms to 11.37 ms** across five interleaved samples per version. Before ranged from 808.29 to 823.65 ms. After ranged from 7.28 to 23.73 ms. [The complete samples](dashboard-loading-benchmark.json) retain errors, cache markers and host-call counts.

The fixture seeded two hosts with 1200 recorded tokens, then recreated the coordinator over the same in-memory KV. One host report had an explicit 800 ms transport delay. The former opening waited for both live reports. The new opening returned saved data without host calls. Every sample returned exactly 1200 tokens and then completed two successful live revalidation calls. No sample failed.

Both versions ran on Node 24.15.0 with the same data and configuration. The ten-core host had a load average of 22.57. Samples were interleaved because unrelated work continued. The limiter was the injected host delay, not chart rendering.

This comparison measures saved display instead of a live-host wait. It does not establish equivalent live-work throughput, cold ingestion speed or installed dashboard latency. Samples predate the TanStack chart rebase, which left the coordinator, cache and report-hook sources unchanged.

## Verification

After rebasing onto the TanStack charts:

- 102 focused tests passed, including cache invalidation, query isolation, SDK boundaries and chart layout.
- 28 owned browser checks passed at desktop and narrow widths. They include saved and cold loading, literal token and cost updates, page reload, recorded-usage controls and stable chart geometry.
- Typechecking passed with SDK 0.6.49.
- The full package attempt did not finish within its 180-second command limit. Earlier validation timeouts are tracked in BBP-212. No timeout or assertion was weakened.

[Browser testing](BROWSER-TESTING.md) documents the owned fixture runner. Fixtures are not installed-browser acceptance.
