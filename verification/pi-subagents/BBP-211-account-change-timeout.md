# BBP-211 account-change timeout

## Result

The reproduced timeout occurs while starting the catalog and active-thread Node children, before account-change rejection or Default recovery. Bounding this package to four Vitest workers removes the reproduced failure without changing the five-second test timeout, adding retries, or replacing the real speed controller.

The historical logs have no stage trace. They prove the original timeout, not its exact stalled operation. These experiments establish a matching load-dependent failure mechanism, not a reconstruction of all historical host activity.

## Scope and environment

- Task: BBP-211, source task BBP-197.
- Thread: [BBP-211 worker](bbthread://thr_zutst7gpnm).
- Historical commit: `cace8bed65418e9a0a6d50d545f457ad7c219659`.
- Local pre-change baseline: `33ef43851e032b03bf21fd3f8e81498a242fe610`.
- Bun 1.4.3, Node v24.15.0, Vitest 4.1.11, ten available logical CPUs.
- Dependencies installed with `bun install --frozen-lockfile` in `bb-plugin-pi-subagents-provider`.
- No production provider or fixture behavior changed.

## Evidence

Fetched both BBP-211 attachments. The historical concurrent run had 547 passes and one five-second timeout. The historical isolated run passed 548 tests in 33.12 seconds.

Local raw logs and the baseline tracing patch are in the [evidence archive](/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=01M4V3YFFP5GBZ55ZE6HMJM1KS). Fetch it with `bb tasks attachment get 01M4V3YFFP5GBZ55ZE6HMJM1KS --out BBP-211-evidence.tar.gz`.

Local checks before the change:

| Check                                                              | Result                                                                                 |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Speed file alone                                                   | 25 passed, 14.92 seconds                                                               |
| Full package suite plus typecheck                                  | 548 passed, 34.08 seconds; typecheck exit 0                                            |
| Two full suites plus typecheck, stage tracing enabled in one suite | Both passed 548; traced account test finished in 2456 ms                               |
| Four full suites plus typecheck, stage tracing enabled             | All four account tests timed out; suites had 8, 8, 8, and 9 failures; typecheck exit 0 |

The temporary trace used `performance.now()` around each awaited stage in the account-change test. It did not add sleeps, mocks, timeout changes, or retries. The trace is removed from the final code. The attached evidence archive contains the instrumentation patch and raw logs.

Stage times are cumulative from entry to the test body:

| Stage                    | Isolated test | Two-suite load |   Four-suite load, suite 4 |
| ------------------------ | ------------: | -------------: | -------------------------: |
| Catalog ready            |        391 ms |        1618 ms |                    4666 ms |
| Active thread ready      |        765 ms |        2423 ms |    11055 ms, after timeout |
| First prompt accepted    |        776 ms |        2434 ms | Not reached before timeout |
| First turn boundary      |        776 ms |        2434 ms | Not reached before timeout |
| Changed account rejected |        786 ms |        2445 ms | Not reached before timeout |
| Default accepted         |        798 ms |        2456 ms | Not reached before timeout |

Across the four failing suites, catalog startup alone took 4392 to 4671 ms. By contrast, the rejection and recovery stages took about 33 ms under the two-suite load. A timed-out async body can continue briefly during teardown, so post-timeout traces are not successful checks.

Vitest's default run worker count on this host is nine, derived from available CPU count minus one. Each bridge worker can also start real Node children that load the generated extension and its Pi dependencies. Four simultaneous suites can therefore run up to 36 test workers, plus child processes and typechecking. This is file/process oversubscription, not evidence of an account controller deadlock. The HTTP and authentication inputs remain local fixture state.

## Changes

- Set `maxWorkers: 4` in the package's Vitest configuration. This bounds file concurrency instead of relaxing test deadlines. It does not cap all other workloads on the host.
- Assert that catalog discovery and thread startup succeed in the account-change regression.
- Save the first turn's delta offset and wait beyond it for recovery. The old literal offset `1` could match the first turn's boundary instead of proving a new boundary.
- Retain successful initial Fast dispatch, rejection after account change, unchanged prompt count on rejection, Default recovery, and final prompt count. The existing native payload-guard and zero-network-dispatch tests remain unchanged and pass in every final full-suite run.

## Final verification

All checks below were run by the worker on the final code, with temporary tracing removed:

| Check                                        | Result                                                                                                |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Speed file alone, verbose reporter           | 25 passed; account test 902 ms                                                                        |
| Full package suite alone                     | 548 passed, 58.93 seconds                                                                             |
| Full package suite plus typecheck            | 548 passed, 39.07 seconds; account test 1311 ms; typecheck exit 0                                     |
| Four full package suites plus typecheck      | Four times 548 passed; account tests 4752 to 4818 ms; suites 88.58 to 89.92 seconds; typecheck exit 0 |
| Oxfmt check of both changed TypeScript files | Passed                                                                                                |
| Oxlint of both changed TypeScript files      | Passed                                                                                                |
| `git diff --check`                           | Passed                                                                                                |

The same four-suite experiment with the worker cap and temporary tracing still enabled also passed four times 548 tests. Its account tests finished in 3641 to 4143 ms. None of these experiments used retries.

Commands run from the package directory:

```sh
bun run test src/bridge/bridge.speed.test.ts --reporter=verbose
bun run test
bun run typecheck
```

For the concurrent checks, start the requested number of `bun run test` processes and one `bun run typecheck` process in the same shell, redirect each output to a distinct log, and retain every process's exit status. For the baseline trace, apply the attached instrumentation patch to the recorded baseline and pass `--disableConsoleIntercept` to the test command. Compare with the same experiment after adding `maxWorkers: 4`.

## Limits and tradeoffs

Four simultaneous full suites are a deliberate stress case, not the exact historical preflight. The final stress run has only 182 ms of headroom in its slowest account test. The ordinary package-suite-plus-typecheck check has about 3.7 seconds of headroom. The worker cap cannot guarantee a five-second deadline under arbitrary external CPU, memory, or I/O pressure, or when overridden by `--maxWorkers` or `VITEST_MAX_WORKERS`.

Lower file concurrency can increase isolated suite duration. The measured durations are single-run observations, not a stable performance benchmark. No installed-provider, browser, build, or live-account acceptance was run because this change only affects test scheduling and regression assertions. These checks do not establish installation or live-provider readiness.

## Independent review

A fresh delegate approved the working-tree changes from the recorded baseline using the routine-review skill. There were no blocking findings. The reviewer independently passed all 25 speed tests, with the account test at 845 ms, typecheck, and `git diff --check`. The reviewer inspected the report and raw concurrent logs but did not repeat the full-suite stress runs. [Saved review](/api/v1/plugins/tasks-plus/http/attachments/download?attachmentId=01M4V43ZJ9WWX85FNWPPZWB5JK).
