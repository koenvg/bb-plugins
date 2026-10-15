# Tasks Plus tracker

Users organize tracker projects and tasks, edit task state, attach Markdown files and explicitly start linked workers through the Tasks UI or CLI.

## Sub-features

- tasks-board: projects/folders, status/priority, labels and subtasks.
- tasks-detail: description/draft preservation and attachment preview.
- document-navigation: document-local headings and footnotes, optional outline, BB-preference HTTP(S) opening and native external modifier intent.
- document-images: explicit credential-free CORS raster images, same-origin BB denial, redirect rejection, bounded streams and blob cleanup.
- tasks-cli: bb tasks reads and approved owned task mutations.
- tasks-worker: explicit worker starts and linked work-thread reporting.

## How to get to it (user POV)

- Choose Tasks in BB's sidebar and open the selected tracker/task.
- Use the attachment filename button to open its Markdown preview; switch Preview/Raw and close it.
- Use the existing bb tasks CLI, inspecting its installed help before any command.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-tasks-plus/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Before setup read the package README's Development checks and COMMENT-REMOVAL-UPGRADE.md. From the root install/build packages/markdown-document with frozen Bun dependencies, then install bb-plugin-codex-quota dependencies and this package. Require SQLite on PATH. Use this package's explicit pinned TypeScript 7 command, not another tsc.

Require a fresh, absent `$EVIDENCE/tasks-browser` output directory, then run:

```sh
BBP53_CAPTURE_PHASE=none bun run --cwd bb-plugin-tasks-plus test:browser --config "$SKILL/references/tasks-playwright.config.ts" --trace on --output "$EVIDENCE/tasks-browser"
```

`BBP53_CAPTURE_PHASE=none` disables only the fixture's fixed-path captures under `verification/BBP-53`. A dedicated checkout is not sufficient protection because it includes those historical files. The [private-capture config](../references/tasks-playwright.config.ts) preserves the package's test assertions, strict listener and browser settings, and enables fresh Playwright screenshots in the private output directory. The CLI does not support a screenshot flag. Retain those screenshots and action traces there instead. Record historical capture hashes before and after the run and require them unchanged; do not delete or replace historical evidence.

The complete suite includes `navigation.spec.ts` for the production overlay's outline, local scroll/focus, safe external activation and remote images. Image responses use `localhost:4193` as a cross-origin host on the same owned listener. Successful image, missing CORS header, redirect and broken bytes are deliberate fixture responses. Cookies exist only in owned browser contexts. The suite reads complete request headers and uses a positive cookie control before checking image credential omission. Blob URL instrumentation observes cleanup without supplying passing UI state. Native external links load `tests/native-destination.html` from the cross-origin listener, not the internet. URL-preference calls use the SDK test provider.

Keep actual new-tab completion assertions separate from unprevented-event and native-request evidence. `native-anchor.spec.ts` reproduces modifier behavior with a plain native anchor. If both product and diagnostic completion fail, retain failed exits and traces, report the observed reproduction and label any environment explanation as inferred. Do not skip these assertions, claim native completion from request dispatch, or change the production link behavior to satisfy the runner.

BBP-55 observed three native-tab failures with headless Chromium 156 on macOS. The same binary and all assertions passed with `--headed`. To compare modes, add `--headed` to the command above and use a new output directory. Keep the headless failure and headed pass as separate results. Do not infer installed BB acceptance from either fixture run. Context-menu non-interception is checked through the rendered public interface, without opening an operating-system menu in the browser suite.

The config owns strict port 4193 and refuses server reuse. Require that port free and serialize runs. The fixture exercises the production Markdown overlay with SDK/transport substitutes. Installed Doctor requires tasks-plus enabled, bundled tasks disabled and the intended tracker identity. Read-only `bb tasks project list --json` proves catalog access, not a mutation. For an approved owned tracker/task, drive a title/status edit and reread through CLI or a reopened panel; inspect Markdown attachments and draft preservation. Starting workers requires separate approval and proof of exactly one linked thread and resulting task state.

## Gotchas

- Only one of bundled tasks and tasks-plus can be enabled; switching or data import is not harmless setup.
- Migration 12 removes task comments. Obtain a verified backup and explicit deployment approval before activation against existing data.
- Local builds use the package's pinned official BB CLI and a disposable BB_DATA_DIR, not the desktop user data.
- Do not create a tracker for verification or task filing without approval, and never delete pre-existing tasks as cleanup.
