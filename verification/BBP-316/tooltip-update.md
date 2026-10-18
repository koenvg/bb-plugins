# Creator-thread tooltip update

Baseline: `5068bc4f38e19edafecfc54565ee6f884cc48a11`.

Koen approved replacing the Created by thread property block with an info icon and tooltip. Refusal errors remain visible. Dispatch behavior is unchanged. No server, blocker policy, MCP, settings, activation, production data, deployment or merge change is included.

## Plan and design

- [x] Capture the failing UI test before replacing the block.
- [x] Replace the metadata block with a focusable info icon in the Properties header and narrow inline controls.
- [x] Verify hover, keyboard focus, Escape, touch activation and outside dismissal.
- [x] Run full checks and an isolated production build.
- [x] Complete independent review and publish the update on PR #313.

The tooltip holds text only. Tapping or activating the icon reveals it without navigating away. This replaces the former standalone thread-link button. The existing Tooltip and Button components provide the interaction and styling. A controlled open state keeps explicit tap activation available alongside hover and keyboard focus. The tooltip uses existing foreground/background tokens instead of introducing colors.

## Evidence

The updated rail test failed on the old UI because the info control did not exist. It now passes, including a hidden default tooltip, keyboard reveal, blocker-status updates and absence of the icon for a human-created task.

The focused Chromium run passed four cases: desktop and narrow metadata/refusal, actual touch activation/dismissal, and board drag refusal with keyboard retry after archive. It verifies a nontransparent tooltip background. The first capture exposed a transparent background when the generic primary tokens were absent in the standalone fixture. The scoped tooltip now uses the same foreground/background tokens as existing controls; the confirmation captures show opaque tooltips.

| Check                          | Result                                                                          | Evidence                                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Tasks suite                    | 133 files, 1502 tests passed                                                    | [Tests](tooltip-tests.log)                                                                 |
| Browser fixtures               | 38 cases passed, including hover, focus, touch and refusal checks               | [Browser](tooltip-browser.log)                                                             |
| Typecheck                      | Passed with the pinned compiler                                                 | [Typecheck](tooltip-typecheck.log)                                                         |
| Lint and formatting            | Passed                                                                          | [Lint](tooltip-lint.log), [format](tooltip-format.log)                                     |
| Production build and SDK match | Passed using a disposable BB_DATA_DIR                                           | [Build](tooltip-build.log)                                                                 |
| Screenshots                    | Opaque tooltip on desktop and touch, refusal error still visible                | [Desktop](tooltip/desktop.png), [touch](tooltip/touch.png), [refusal](tooltip/refusal.png) |
| Historical captures            | BBP-53 file hashes unchanged                                                    | SHA-256 comparison, exit 0                                                                 |
| Mechanical design detector     | No findings                                                                     | Raw run directory                                                                          |
| Independent review             | Approved, no actionable findings. Logs inspected; tests not independently rerun | [Review](tooltip-review.md)                                                                |
| Installed acceptance           | Not run or authorized                                                           | No plugin activation or settings change                                                    |

Browser task RPC and lifecycle remain explicit transport substitutes. Full run data is retained at `/Users/koen/.bb/thread-storage/thr_9e6riv42k5/bbp316-tooltip.x1Y59c`. Owned browser contexts and the strict-port listener were torn down. The disposable build data was removed.
