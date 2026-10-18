# Task attribution retention checks

## Scope and decision

BBP-243 tracks task attribution disappearing from an open reader while its selected row and tool remain. The original attachments establish the symptom, not its exact cause. Their stored before/after event payloads are unavailable in this investigation.

Koen approved retaining known attribution for rows still present in the current replay, within existing memory limits. The reader now carries only task text and its clipping flag between successful history reads. It matches full row ID, session ID, and run ID. It does not retain absent rows or extend transcript, output, model, or durable-history retention. Closing the panel or changing threads releases this local attribution.

## Reproduction and regression

The hook reads the newest 64 extension-state events every four seconds. Previously, each successful read replaced the prior restored snapshot. When the only task-bearing event left that window, the next snapshot lost the task even though newer events still supplied the same row and tool.

The regression uses the public event-list boundary and the real panel. Its first response contains 63 newer observations without a task and the task-bearing observation at position 64. Its second response contains 64 observations without that task.

Run from the package directory:

```sh
bun run test src/ui/subagents-panel.test.tsx -t 'retains task attribution'
```

Before the fix, this failed at the heading assertion after the second poll. After the fix, the original heading and selected button remain. The reader, Task, Conversation, and tool nodes stay identical. Task, Conversation, and tool disclosures remain open, and keyboard focus stays on the tool summary. Reopening the panel shows the truthful missing-task notice instead of restoring reader-local data.

Additional regressions cover new and explicitly empty task text, task clipping, current capture status/times, absent rows, empty or unsupported replay, repeated local step identities, cross-session/run isolation, thread changes with late replies, and row/byte-budget pruning. They assert that no old transcript, output, or model leaks into a newer replay.

## Local verification

Checks ran with Bun 1.4.3 and Node 24.15.0:

| Check                                                     | Result                                                                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Package frozen dependency setup                           | Passed                                                                                                              |
| Package tests                                             | 762 passed in 59 files                                                                                              |
| Package typecheck                                         | Passed                                                                                                              |
| `bb plugin types bb-plugin-pi-subagents-provider --check` | Passed with SDK and host 0.6.49                                                                                     |
| Package production build                                  | Passed for server, host, and app artifacts                                                                          |
| Root `bun run check`                                      | Passed, including setup and browser-lifecycle tests, lint, and formatting. Existing unrelated lint warnings remain. |
| `git diff --check`                                        | Passed                                                                                                              |

## Isolated headless browser evidence

A temporary source fixture runs the real `SubagentsPanel` and history hook through the public SDK frontend test harness. Only the event-list boundary is faked. The harness uses plain-text Markdown, not BB's installed Markdown renderer.

Owned headless Chromium contexts ran at 1100 by 800 and 390 by 700 pixels. Each case opened Task and the tool through clicks, focused the tool summary, and observed an initial history read plus two four-second refreshes. Both cases retained all five observed nodes, task purpose, focus, and all open disclosures. The focused summary moved 0 CSS pixels. Reopening the reader showed the missing-task notice through Capture details. No external requests or page errors occurred. The browser and ephemeral loopback listener closed after the run.

Two initial fixture runs failed because the collector used the wrong selected-button selector and expected a notice inside closed Capture details to be visible. Correcting the collector to use `aria-pressed` and opening Capture details required no product-code changes. Failed logs remain in the task evidence.

The task attachments retain structured browser results, screenshots, scripts, and check logs. These source checks do not prove installed BB acceptance or establish the cause of the original live incident. No settings, credentials, installed plugin source, or production data changed. No merge or deployment was performed.

## Independent review

A fresh `routine-review` delegate approved the source scope without implementation blockers. The reviewer independently passed 51 tests across three files, typecheck, report formatting, and whitespace checks. All nine supplied evidence hashes matched. The reviewer did not rerun the browser or claim installed acceptance.

The sole non-blocking finding concerned the polling description. The report now states the verified initial read plus two four-second refreshes. No product-code changes followed review.
