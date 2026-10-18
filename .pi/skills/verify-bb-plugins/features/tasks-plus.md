# Tasks Plus tracker

Users organize tracker projects and tasks, edit task state, attach Markdown files and explicitly start linked workers through the Tasks UI or CLI.

## Sub-features

- tasks-board: projects/folders, status/priority, labels and subtasks.
- tasks-detail: description/draft preservation and attachment preview.
- document-navigation: document-local headings and footnotes, optional outline, BB-preference HTTP(S) opening and native external modifier intent.
- document-images: explicit credential-free CORS raster images, same-origin BB denial, redirect rejection, bounded streams and blob cleanup.
- tasks-cli: bb tasks reads and approved owned task mutations.
- tasks-worker: explicit worker starts and linked work-thread reporting.
- tasks-webhooks: global and tracker-scoped task-created POST delivery and redacted CLI management.

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

The complete suite includes `navigation.spec.ts` for the production overlay's outline, local scroll/focus, safe external activation and remote images. Image responses use `localhost` with the run's actual port as a cross-origin host on the same owned listener. Successful image, missing CORS header, redirect and broken bytes are deliberate fixture responses. Cookies exist only in owned browser contexts. The suite reads complete request headers and uses a positive cookie control before checking image credential omission. Blob URL instrumentation observes cleanup without supplying passing UI state. Native external links load `tests/native-destination.html` from the cross-origin listener, not the internet. URL-preference calls use the SDK test provider.

Keep actual new-tab completion assertions separate from unprevented-event and native-request evidence. `native-anchor.spec.ts` reproduces modifier behavior with a plain native anchor. If both product and diagnostic completion fail, retain failed exits and traces, report the observed reproduction and label any environment explanation as inferred. Do not skip these assertions, claim native completion from request dispatch, or change the production link behavior to satisfy the runner.

The package config selects `channel: "chromium"` to run Playwright's full Chromium in headless mode, not the default headless shell. The optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` override remains available. CI already installs full Chromium. BBP-55's current complete suite passes all 23 tests headless without an executable override. See [the CI-fix evidence](../../../../verification/BBP-55/report.md#ci-fix-for-pr-277).

Historical default-shell runs failed three native-tab checks on macOS and Linux. The earlier claim that headed and headless used the same binary was incorrect. Retain those failures separately from the current pass. Use `--headed` only for a separate mode comparison with fresh output. BBP-247 tracks headed native-scrollbar width failures, not these native-tab failures. Neither fixture mode proves installed BB acceptance. Context-menu non-interception is checked through the rendered public interface, without opening an operating-system menu in the browser suite.

The package runner owns an OS-assigned loopback port and hands its validated origin to Playwright. Raw Playwright without the handoff fails. Each run has a private Vite cache and stops only its owned process groups, so independent checkout runs can overlap. Fixed-port refusal and peer-preserving teardown are covered by `scripts/browser-preview-servers.test.mjs`; `bun scripts/verify-concurrent-browser-worktrees.mjs "$EVIDENCE" tasks-plus` proves distinct origins and source markers across two simultaneous checkouts. The fixture exercises the production Markdown overlay with SDK/transport substitutes. Installed Doctor requires tasks-plus enabled, bundled tasks disabled and the intended tracker identity. Read-only `bb tasks project list --json` proves catalog access, not a mutation. For an approved owned tracker/task, drive a title/status edit and reread through CLI or a reopened panel; inspect Markdown attachments and draft preservation. Starting workers requires separate approval and proof of exactly one linked thread and resulting task state.

For shared document changes, also follow [shared Markdown verification](../references/shared-markdown.md). It compares this production attachment owner with the real Reader and checks immediate theme coherence. Tasks permits local fragments, BB-preference HTTP(S) links and bounded credential-free remote raster images, but denies relative filesystem destinations; source-aware Reader links do not grant attachment filesystem access.

Webhook verification uses `bun run --cwd bb-plugin-tasks-plus test cli/webhooks.test.ts webhooks/index.test.ts`, with a new private log file under `$EVIDENCE`. These public CLI/RPC tests use owned ephemeral loopback HTTP receivers. Deterministic stalled-request cases substitute only external fetch and timers. They cover exact payload and Authorization, global-plus-tracker routing, rollback silence, retries, redaction, concurrent settings mutations, reload, queue bounds, and disposal. Run the pinned package typecheck separately. SDK fake-host evidence is not installed acceptance.

For installed webhook acceptance, first obtain exact-source activation approval and an owned tracker, receiver, and cleanup ledger. Existing global endpoints receive every task creation, including verification tasks. Do not inspect or copy their secrets. If unintended delivery cannot be excluded, block the mutation check. Use a private regular UTF-8 config file and inspect installed `bb tasks webhook --help`. Create a global endpoint and an explicitly scoped tracker endpoint. List their redacted IDs, run `webhook test <id> --json`, then create one approved owned task through CLI and one through UI or RPC. Observe exact receiver payloads and Authorization without retaining tokens. Check successful task creation while the owned receiver fails or stalls. Delete only the endpoints this run owns and confirm absence through a second list. Record receiver shutdown and approved task cleanup separately. Missing activation, network-send, tracker-mutation, or cleanup approval blocks this recipe; it does not permit another BB server or a silent source switch.

## Gotchas

- Only one of bundled tasks and tasks-plus can be enabled; switching or data import is not harmless setup.
- Migration 12 removes task comments. Obtain a verified backup and explicit deployment approval before activation against existing data.
- Local builds use the package's pinned official BB CLI and a disposable BB_DATA_DIR, not the desktop user data.
- Do not create a tracker for verification or task filing without approval, and never delete pre-existing tasks as cleanup.
