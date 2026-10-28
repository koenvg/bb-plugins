
# Verify Markdown Reader

Read [the repo-wide feature index](../features/README.md), then the Markdown Reader feature files. Run from the repository root. For installed acceptance, follow [the preserved installed-plugin workflow](installed-workflow.md). This reference covers only the production reader's isolated local preview.

The local preview renders production `Reader` and `app.css` through Vite. `tests/preview.tsx` substitutes only the host document-read callback and bound Original component, using the public SDK runtime. Selection previews use the official SDK frontend harness. No BB installation, account, seed database, or credentials are needed. This proves component behavior, not native file opening, host confinement, or the live chat composer. Do not label fixture evidence as installed acceptance.

## Launch

Use Bun 1.4.4 and Node 26.0 or newer within Node 26. Require `curl`, `lsof`, and POSIX Bash. Inspect package scripts before setup. From the repository root:

```sh
bun install --cwd bb-plugin-markdown-reader --frozen-lockfile
(cd bb-plugin-markdown-reader && bun --bun run playwright install chromium)
bun run --cwd bb-plugin-markdown-reader typecheck
```

Stop if setup, typecheck, or startup fails. Preserve the error; source fixes need their own scope. Chromium setup downloads browser binaries and can remove obsolete binaries from the user's Playwright cache. It does not access BB accounts.

Run the complete document-view proof:

```sh
SKILL="$PWD/.pi/skills/verify-bb-plugins"
EVIDENCE="${BB_THREAD_STORAGE:-/tmp}/markdown-reader-proof-$(date +%Y%m%d-%H%M%S)-$$"
"$SKILL/scripts/verify.sh" "$EVIDENCE"
```

`verify.sh` creates a new private evidence directory, launches `bun tests/preview-server.ts` from this checkout, runs Doctor and Drive, then cleans up on success or failure. It refuses an existing evidence directory. It requests port `0`, and waits up to 30 seconds for `BB_FIXTURE_READY` with the actual loopback origin. Vite compiles the current source on request. There is no prebuilt bundle to reuse. Origin and PID are recorded in `origin.txt` and `preview.pid`.

For other mapped features, use their existing `bun run test:browser` recipes. That runner starts its own preview, uses a fresh browser context per test, and tears down its owned POSIX process groups and temporary cache. Direct `playwright test` bypasses the required origin handoff and fails.

Two previews can run side by side because each binds its own ephemeral port and owns its temporary cache. Use distinct evidence directories. Package installs and package-default test report directories are shared within one checkout; do not run setup concurrently. Override both Playwright output and report paths for simultaneous suites.

## Doctor

The read-only instance check is:

```sh
"$SKILL/scripts/doctor.sh" "$PREVIEW_PID" "$ORIGIN"
```

It requires a live preview process, its working directory to match this checkout's package, its PID to own the origin's TCP listener, and the root response to identify `Markdown Reader fixture`. `verify.sh` supplies the live PID and origin and saves `doctor.txt` before browser actions. Run this check first whenever an instance looks wrong. Once automatic cleanup runs, Doctor should fail because that instance is gone.

For installed checks, inspect `bb status --json`, `bb plugin list --json`, and `bb plugin source markdown-reader --json` first. Running status alone is not exact-checkout identity. Follow the existing verification workflow's build, activation, browser, and approval checks. A browser profile does not isolate BB's shared server or database. Ask before source switching, installation, enabling, or changing persistent opener defaults. Do not start or stop the user's BB server for a fixture run.

## Drive

```sh
node "$SKILL/scripts/prove.mjs" "$ORIGIN" "$EVIDENCE"
```

Use this only with the preview owned and checked by this run. `verify.sh` already calls it. It launches an owned headless Chromium through this package's locked Playwright installation. It opens `/?width=760&theme=light`, waits for `Reading a workspace document`, focuses the `Raw` button and presses Enter, compares `Raw Markdown` to the complete fixture source, then activates `Preview` by keyboard. It captures each state and proves that view switching did not increase the read count or alter the source file. All browser HTTP requests must be GETs to this origin; unexpected external requests fail.

The maintained recipes for [navigation](../features/navigation.md), [refresh](../features/refresh.md), and [selection](../features/selection.md) reuse existing suites and real accessible names. Existing host-prop events in navigation tests model host entry requests; they do not establish native BB routing. Treat fixture instrumentation as observation or boundary setup, never as a substitute for user activation of the feature under test.

## Evidence

Retain the directory passed to `verify.sh`. It contains:

- `checkout.txt`, `server.log`, `preview.pid`, `origin.txt`, and `doctor.txt` for checkout and instance identity.
- `01-preview`, `02-raw`, and `03-preview-restored`, each with a PNG and an ARIA snapshot.
- `trace.zip` for browser actions and resulting DOM states, plus `drive.log` and `result.json` for assertions, request records, source hash, and coverage limits.
- `cleanup.txt` for teardown. The shell exit code is authoritative; a passing `result.json` does not cancel failed cleanup.

Exercise the real user path. Capture both the action and the result, not only a final screen. For writes, inspect the resulting file, stored row, or draft alongside the UI. Only substitute external systems at existing production boundaries. The generated proof is read-only, not a named dry-run: it observes unchanged fixture bytes, one document read across view changes, and browser network methods/origins. This does not prove that BB's real host service never writes. For installed paths, observe actual file hashes, draft state and sends using approved owned records.

Every proof names the feature ID, entry point, checkout, expected result and observed result. Classify each mapped entry point as passed, failed, blocked, or not run. Fixture shortcuts cannot prove other entries. Do not claim all features passed after only the document-view smoke check.

Inspect a trace with the installed package's Playwright CLI:

```sh
(cd bb-plugin-markdown-reader && bun --bun run playwright show-trace "$EVIDENCE/trace.zip")
```

## Cleanup

`verify.sh` sends TERM only to its own preview PID, waits for graceful teardown, and uses KILL on that PID only after five seconds. Forced termination makes the run fail. It removes only its fresh scratch directory. `prove.mjs` closes its owned browser in a finally block, including on assertion failure. It never attaches to user tabs or a signed-in browser. No process-name kills are used. Host crashes and SIGKILL bypass normal cleanup; inspect recorded ownership before any manual recovery.

After the script returns, require exit code zero, then confirm proof survived:

```sh
test -s "$EVIDENCE/result.json"
test -s "$EVIDENCE/trace.zip"
test -s "$EVIDENCE/01-preview.png"
test -s "$EVIDENCE/02-raw.png"
test -s "$EVIDENCE/03-preview-restored.png"
cat "$EVIDENCE/cleanup.txt"
```

On failure, retain logs and partial evidence. Resolve the fault and run again with a new directory. Run cleanup after every failed iteration. Never delete the evidence as teardown. Installed mutations require the recorded, approved restoration plan from the existing verification workflow, with concurrency checks before restoration.

## Helpers

All entry scripts are executable. Invocations are shown above:

- `scripts/verify.sh NEW_EVIDENCE_DIRECTORY` orchestrates launch, Doctor, the document-view proof, and cleanup.
- `scripts/doctor.sh PREVIEW_PID ORIGIN` checks a live instance without mutating it.
- `scripts/prove.mjs ORIGIN EXISTING_EVIDENCE_DIRECTORY` drives the owned production reader UI and captures proof.

For maintenance, use `/maintain-verification-skill` when available to update the feature map as routes, controls, or contracts change.
