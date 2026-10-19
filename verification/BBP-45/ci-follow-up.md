# PR 317 browser CI correction

## Failure and root cause

The [original failing job](https://github.com/koenvg/bb-plugins/actions/runs/39159950931/job/117770963631) failed both due-date layout tests at baseline `4277fb031705f0d02a650e335a55317522a61c49`. This is a reproducible test defect, not an unrelated flake.

The original test pressed ArrowUp after focusing a native date input. Its exact expected update was July 17, but Linux Chromium incremented the month instead.

```text
Expected: "[{\"taskId\":\"task-1\",\"dueDate\":\"2026-07-16\"},{\"taskId\":\"task-1\",\"dueDate\":\"2026-07-17\"}]"
Received: "[{\"taskId\":\"task-1\",\"dueDate\":\"2026-07-16\"},{\"taskId\":\"task-1\",\"dueDate\":\"2026-08-16\"}]"
```

The unchanged tests reproduced both failures in a local Linux container. Native accessibility inspection showed Month initially focused on Linux and Day initially focused on macOS, despite the same en-GB browser-context locale. Both used Chromium 156.0.8078.4. Page locale did not establish which native date segment received ArrowUp. Application code correctly persisted the value emitted by the browser.

## Fix and assertion preservation

The only test-source change replaces one key with two keys.

```diff
-    await page.keyboard.press("ArrowUp");
+    await page.keyboard.press("Alt+ArrowDown");
+    await page.keyboard.press("ArrowRight");
```

Alt+ArrowDown opens the native calendar without changing the date. ArrowRight selects the following day. This produced exactly July 17 from Day, Month, and Year starting segments in macOS diagnostics, and from Linux's Month segment. The production-control fixture passed at both widths on both platforms.

Every existing assertion and expected literal remains verbatim. Exact ordered task-update arrays, July 17, focus, Escape, removal, fresh-task targeting, and unavailable-target checks remain intact. No skips, retries, timeout changes, tolerated alternate values, forced focus, or DOM setters were added. No product code, dependencies, configuration, user settings, or date-save policy changed.

## Local verification

| Check                                          | Result                                                                | Evidence                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------- |
| Unchanged macOS command tests                  | 4 passed, exit 0                                                      | `mac-baseline-browser.log`                                |
| Unchanged Linux command tests                  | 2 failed and 2 passed, exit 1, same expected/received mismatch as CI  | `linux-baseline-browser.log`                              |
| Native segment diagnostics                     | Day on macOS, Month on Linux, matching each platform's ArrowUp result | `parent-native-segments.log`, `linux-native-segments.log` |
| Fixed macOS command tests                      | 4 passed, exit 0                                                      | `mac-fixed-focused-browser.log`                           |
| Fixed Linux command tests                      | 4 passed, exit 0                                                      | `linux-fixed-focused-browser.log`                         |
| Full fixed macOS browser suite                 | 36 passed, exit 0                                                     | `mac-fixed-full-browser.log`                              |
| Full fixed Linux browser suite                 | 36 passed, exit 0                                                     | `linux-fixed-full-browser.log`                            |
| Pinned package typecheck, lint, and formatting | Passed, lint retains warnings in unchanged files                      | `typecheck.log`, `lint.log`, `mac-fixed-format-check.log` |

The Linux reproduction used an isolated local ARM64 container with Node 24.15.0, Bun 1.4.3, frozen package installs, and full Playwright Chromium. GitHub's runner is Linux x64, so this is a matching Linux reproduction, not a claim of identical runner hardware. The fixed spec hash was identical in the host checkout and container, `6275ebdfecfb662e4d927e5b2e184900e198d914c5577aac901e206bcd3cfc4b`.

The container used an existing local toolchain image, `bbp85-ci-node24-bun143`, without changing that image. Setup exceeded the first command's timeout while package downloads continued. The parent waited for the owned setup process to finish, then observed installed Chromium and ran the recorded tests. Setup was not blindly repeated.

Tests used the existing package runner, private-capture configuration, `BBP53_CAPTURE_PHASE=none`, new evidence directories, and retained traces. No host port was published. Owned Linux listeners and caches were absent after the runs. The owned container was removed. The macOS full-run listener and cache were also absent. No other container or listener was stopped.

The [work thread](bbthread://thr_qm3embsv5b) retains the original CI job log and all local evidence under `/Users/koen/.bb/thread-storage/thr_qm3embsv5b/bbp45-ci-evidence`. The [independent follow-up review](ci-review.md) covers the correction and evidence. Remote checks must pass on the pushed fix before CI repair is complete.

## Reproduce the browser check

After the package's documented frozen setup, run from the repository root in either a macOS or Linux environment with full Chromium installed.

```sh
EVIDENCE="$(mktemp -d)"
BBP53_CAPTURE_PHASE=none bun run --cwd bb-plugin-tasks-plus test:browser \
  --config "$PWD/.pi/skills/verify-bb-plugins/references/tasks-playwright.config.ts" \
  --trace on --output "$EVIDENCE/browser"
```

Add `task-commands.spec.ts` before `--trace` for the four focused tests. The baseline commit fails the two due-date cases on the measured Linux environment. The corrected test passes all existing assertions on both measured platforms.

The Fix Root Causes principle kept the repair in the test's native-keyboard assumption rather than changing correct product persistence. Test Behavior, Not Implementation kept real keyboard input and the original exact assertions.

Installed-BB acceptance and personal-binding checks remain blocked by the no-deployment and no-settings restrictions. Nothing was merged or deployed, and no production data, credentials, or secrets were changed or inspected for this repair.
