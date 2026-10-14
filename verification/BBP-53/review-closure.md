# BBP-53 review-fix evidence

These are implementation fixes against baseline `939bd318cedb00239b73e1fd1c3d5d90c79ada70`, not final acceptance. The parent owns independent finding inspection, any renewed safeguard review, checklist changes, and acceptance.

The original independent review remains unchanged at `/Users/koen/.bb/pi-subagents-bridge-sessions/subagent-artifacts/fc0b7738-34a8-4c44-9f34-3eb412a460cb_delegate_output.md`. Its SHA256 remains `4a145b1046637677c819e7604e3a98669e59286918e8e42133c28dcab33b53fe`. `review-p1-source-proof.log` verifies that fingerprint. Prior `result.md`, logs, screenshots, and review evidence were not overwritten.

## P1. Official build-tool bootstrap

The pinned [official quickstart](https://github.com/get-bb/bb/blob/4c87fdec7b7effc022ff2ee31ec95c0a09c9ee62/plugins/bb-guide/skills/bb-plugin-authoring/references/quickstart.md) explicitly supports adding `bb-app` to development dependencies for CI and server-free `bb plugin build`. The [official CLI implementation](https://github.com/get-bb/bb/blob/4c87fdec7b7effc022ff2ee31ec95c0a09c9ee62/apps/cli/src/commands/plugin.ts#L1625-L1652) calls its app/server builders and resolves the official downloaded toolchain. No replacement bundler was introduced.

- Tasks now pins `bb-app@0.46.0`. This release's source and built metadata identify SDK 0.6.37. Frozen Bun installs provide `node_modules/.bin/bb`; Bun's build script selects that local binary.
- The lockfile pins the official npm tarball integrity. `review-p1-source-proof.log` compares the actual downloaded tarball SHA512 with both registry metadata and the Tasks lockfile. `review-p1-toolchain.json` records the official source, version, digest, publisher, and provenance pointers.
- The registry identifies a GitHub Actions trusted publisher. Provenance names `get-bb/bb`, `.github/workflows/publish-bb-app.yml`, and commit `4c87fdec7b7effc022ff2ee31ec95c0a09c9ee62`. An isolated `npm audit signatures` check verified 195 registry signatures and 80 attestations. See `review-p1-publisher.log`. This npm probe is outside the worktree and does not install a user runtime or plugin.
- The existing Tasks-only prerequisite step now explicitly installs SQLite, `build-essential`, and Python 3. The new local tooling check verifies version 0.46.0 and runs `node_modules/.bin/bb plugin types . --check`. The required plugin build remains `bun run build`, which executes `bb plugin build`. Build-related steps use `${{ runner.temp }}/bbp53-build-data` for tool downloads. Unrelated job behavior is unchanged.
- `clean-build.mjs` now removes ambient BB from PATH and checks that spawning it returns ENOENT before dependency installation. It uses frozen clean installs, the explicit local CLI, an isolated temporary `BB_DATA_DIR`, exact app/server metadata checks, bundled common code/CSS checks, and consumer-owned React checks. Browser captures are disabled in this validation.

### Clean-run proof

`review-clean-build.log` passed the macOS clean sequence without desktop/global BB. It records 4 shared tests, 80 focused Tasks tests, typechecks, SDK check, actual official plugin build, metadata 0.46.0/0.6.37, independent shared code/CSS, consumer React, and 8 browser tests. This first run predates the added settled listbox red checkpoint.

`review-linux-with-prerequisites.log` passed the same clean sequence on Linux ARM64 in the official `mcr.microsoft.com/playwright:v1.64.0-noble` Ubuntu container, with Bun 1.4.3, Node 24.21.0, SQLite 3.45.1, `build-essential`, and Python 3. `review-linux-with-prerequisites-exit.log` is `0`. The log proves no ambient BB, clean frozen installs, 4 shared tests, 80 focused Tasks tests, types/SDK, official app/server build metadata 0.46.0/0.6.37, independently bundled Markdown code/CSS, consumer-owned React, and 8 pinned-browser tests. It also reproduces the reviewed selector's compact listbox focus theft, the baseline shortcut failure, and a shared-test failure that prevents consumer setup. All three red runs are deliberate; final preview/shortcut sources are restored. The shared sentinel remains only in the disposable checkout.

The first Linux run failed because its minimal Ubuntu Playwright image lacked `make` when the new `bb-app` transitive `better-sqlite3@13.0.3` needed compilation. Its exit-1 evidence remains in `review-linux-clean-build-final.log` and `review-linux-exit-code.log`. The passing retry installs the native prerequisites now declared for Tasks CI. The earlier bind-mount attempt failed before execution because `/tmp` was not shared with Docker; its error remains in `review-linux-clean-build.log`.

The Linux proof is ARM64, not GitHub's x86-64 hosted runner. It establishes actual Linux command feasibility, not unexecuted x86-64 or GitHub Actions results. The source snapshot is `/Users/koen/Library/Caches/bbp53-linux-source-JccSMY/checkout`. The exited proof container is `bbp53-linux-proof-1791999252`; its retained checkout is `/tmp/bbp53-clean-emlLby/checkout`. It ran `apt-get install -y sqlite3 build-essential python3`, then `node verification/BBP-53/clean-build.mjs` from a read-only snapshot. The container used an existing Linux Bun 1.4.3 executable, not the macOS executable or desktop BB.

GitHub Actions itself has not run. Container verification is not a claim of hosted-runner execution.

## P2. One overlay policy for shortcuts and focus restoration

The named data shape is an active overlay DOM element with a dialog, alertdialog, menu, or listbox role and an optional excluded owner panel. Existing `PreviewState`, request tickets, and focus sessions remain unchanged.

`hasOpenOverlay(exclude: HTMLElement | null = null)` now supports ignoring only the supplied panel's own containing/contained overlay. Shortcut callers pass no exclusion. The preview's deferred focus callback calls this same helper instead of maintaining another selector. Hidden, inert, and aria-hidden ancestor suppression remains intact. Trigger/fallback usability checks still reject disconnected, disabled, hidden, and invisible targets. No shortcut safeguard was relaxed.

### Exact behavior tests

- `views/detail/attachment-preview.test.tsx` adds `does not steal newer listbox focus during deferred dismissal, compact=%s` for desktop and compact. It uses the actual attachment grid, preview owner, and responsive Dialog under StrictMode. Close runs before a newer listbox mounts and receives focus. The assertion runs after queued work and a 30 ms dismissal settle.
- `review-p2-red.log` reproduces the original selector stealing listbox focus, with the compact assertion receiving the attachment trigger instead of the listbox. That initial desktop assertion passed before the later settle was added. Do not describe this initial log as a desktop red reproduction.
- `shell/shortcuts.test.ts` adds `excludes only the owner's panel while a newer %s still blocks focus and shortcuts` for dialog, alertdialog, menu, and listbox. The owner exclusion does not bypass another overlay or affect shortcut callers. Existing tests still cover hidden/inert/aria-hidden ancestors and overlapping active overlays.
- `tests/browser/preview.spec.ts` adds `new listbox owns focus after preview dismissal at ${width}px` at 1280 and 390 px. It closes the actual preview, synchronously mounts a newer listbox actor, and focuses it before deferred restoration. Focus remains on that listbox after dismissal and a further 350 ms. Both `s` and `]` leave the actual shortcut-provider count at zero.
- Existing rendered tests cover `rapid reopen does not let obsolete dismissal restore focus`, `Retry keeps its original focus session`, `does not restore obsolete focus into a newer overlay`, hidden-trigger fallback, confirmed removal, invalidated responses, task replacement, and unmount. Existing full-task rendered tests retain the real editor, draft, save, route, scroll, and workflow checks. Existing desktop/compact browser tests retain ordinary Close/Escape trigger restoration, successful-removal fallback, and shortcut recovery.

## Final worktree checks

| Evidence                              | Result                                                                                                                                                                                                                                                                     |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `review-focused-final.log`            | 3 files, 76 focused shortcut/owner/full-task tests passed                                                                                                                                                                                                                  |
| `review-full-final-rerun.log`         | Shared frozen install/build/4 tests/typecheck; Tasks frozen install/124 files/1284 tests/typecheck; explicit local SDK check; official build; 8 pinned-Chromium browser tests; scoped shared/Tasks lint/format; 8 environment checks; diff and empty staging checks passed |
| `review-linux-with-prerequisites.log` | Linux ARM64 clean frozen bootstrap, official plugin build, 80 focused tests, 4 shared tests, 8 browser tests, metadata/bundle/React checks, and three deliberate red gates passed; outer exit 0                                                                            |
| `review-browser-first.log`            | Earlier 8 browser tests passed before the settled rendered-test addition                                                                                                                                                                                                   |
| `review-p1-publisher.log`             | Official package signatures and attestations verified in an isolated probe                                                                                                                                                                                                 |
| `review-p1-source-proof.log`          | Downloaded tarball/registry/lock integrity equality, pinned SDK source, official CI guide, and unchanged independent review fingerprint verified                                                                                                                           |
| `review-source-final.log`             | Final shared/Tasks/script lint, format, script syntax, whitespace, fixed baseline, empty staging, and original review fingerprint passed                                                                                                                                   |

`review-full-final.log` contains an initial command-name error after the application checks passed (`test:env-setup` does not exist). The corrected full run uses `test:setup` and passes. Four existing lint warnings remain in `attachments/index.ts`, `api/index.ts`, `shell/keyboard.test.tsx`, and `views/list/list-preference.ts`. No new lint warning or error was added.

No visual geometry changed. Existing parent-inspected `final-1280`/`final-390` captures remain intact. No new capture, UI polish, or detector run was performed. Final browser checks use available pinned Chromium revision 1248 and do not install a local browser.

## Residual limits and authority

Real-host unauthenticated denial remains **BLOCKED**. No approval was given to install this checkout. No installed-source change, enabled-state change, live record, task/status write, commit, PR, or child agent was made. An npm development build-tool dependency is not plugin-installation approval.

The generic listbox actor exercises the public active-overlay/focus contract alongside actual preview components. It is not a claim that every production combobox integration or installed-host overlay has been tested. GitHub Actions execution and real-host authentication denial remain separate unavailable checks.

Temporary clean checkouts, tool probes, and Linux validation resources are retained for inspection. Deliberate historical/sentinel tests in disposable clean validation are expected failures, not final worktree failures.

The Model the Domain principle kept the existing owner state shapes and represented overlay exclusion with one optional element. The Laziness Protocol removed the duplicate overlay selector rather than adding layers. Test Behavior, Not Implementation drove focus and shortcut assertions through rendered/browser components. Prove It Works drove actual official build artifacts and rerunnable minimal-PATH clean checks.
