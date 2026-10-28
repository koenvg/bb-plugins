# Run an approved disposable Chrome verifier

Use this helper only for the installed Browser Use branch. Read [the browser contract](browser-contract.md) and [installed workflow](installed-workflow.md) first. Owned fixture runners remain separate.

## Check without launch

From the checkout root:

```sh
helper="$PWD/.pi/skills/verify-bb-plugins/scripts/owned-browser.py"
python3 "$helper" check
```

`check` reads executable paths, interpreter links, package metadata, public helper signatures, and installed route configuration. It starts no process, calls no Doctor or endpoint, and creates no profile, daemon, or evidence directory. Availability is not live readiness. Missing or unsupported prerequisites block the run. Do not install, repair, or switch tools automatically.

The supported installation is Browser Use 0.13.10 or 0.13.11 with Harness 0.1.13 from the same installation and interpreter. The default Chrome is `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`. `--chrome` selects another explicitly approved dedicated Chrome or Chromium executable. `--browser-use` and `--harness` must select matching installed CLIs. `--ps` and `--lsof` select OS identity executables, mainly for boundary tests.

## Record approval before allocation

Obtain explicit permission for this executable's launch, its possible foreground effect, and closing only owned resources. Record the actual approval in a private JSON file. This is a caller attestation, not a consent dialog or permission granted by this skill.

```json
{
  "reference": "<actual user approval reference>",
  "chrome": "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "launch": true,
  "foreground": true,
  "cleanup": true
}
```

For signed-in checks, obtain separate approval for dedicated Chrome and the intended account. Add `"signed_in": true`, a non-secret `"account"` label, and `"account_reference"` containing that approval reference. Pass `--signed-in`. A fresh profile inherits no login. Stop at login, MFA, consent, or uncertain account selection and ask the user. Never transfer cookies or use Arc or cloud fallback.

## Run one trusted verifier

Require the actual runtime `BB_SERVER_URL`. The helper accepts an absolute HTTP or HTTPS URL without credentials and exports only its origin. It never guesses a BB port or starts BB.

```sh
python3 "$helper" run \
  --approval "$APPROVAL_FILE" \
  --evidence "$EVIDENCE/owned-browser" \
  --timeout 300 \
  -- /absolute/path/to/trusted-verifier
```

The evidence directory must be new and its parent must exist. Keep approval references, commands, and logs free of secrets. Read verifier output from the ledger's private `call-*.stdout` and `call-*.stderr` files. Stdout from the helper contains a final JSON summary. The default verifier deadline is 300 seconds. Timeout and cancellation still run cleanup.

The foreground owner holds the browser and active child handles. It launches Chrome directly with a fresh private profile and literal port zero. It proves the actual loopback listener and process/profile identity, then records the sole initial `page` target at `about:blank` before daemon connection. A private short runtime and fresh non-default name isolate routing.

The initial inventory must contain exactly one page and no webviews. Additional pages or webviews refuse before provisioning and retain the browser and profile. Nonpage targets such as Chrome's `browser_ui` are not task tabs and are never selected or explicitly tab-closed.

Strict Doctor must report that exact name absent before one read-only non-strict public Browser Use provisioning invocation. The returned provisioning ID is recorded before later browser calls. The public CLI may retry internally. The helper never retries provisioning and preserves resources if the ID is missing. Every later call uses the same strict route. Conflicting installed `.env` routes refuse before allocation. Explicit pins prevent `.env` from restoring cloud routing, auto-spawn, recording, or title marking.

The trusted verifier receives a fresh fixed environment, not the caller's credentials or browser variables. Its `PATH` contains the matching tool installation and system defaults. Use absolute paths for other tools. It receives:

- `BU_NAME`, `BU_CDP_URL`, an empty `BU_CDP_WS`, and `BH_REQUIRE_EXISTING_DAEMON=1`.
- Private `BH_RUNTIME_DIR`, `BH_TMP_DIR`, `BH_AGENT_WORKSPACE`, and configuration paths.
- `task_target` for the recorded initial page, `provisioning_target`, and `task_created_targets` as a JSON array.
- `BB_SERVER_URL` and `bb_url` containing the runtime BB origin.
- `BB_OWNED_BROWSER_EVIDENCE` and `BB_OWNED_BROWSER_ALLOW_NEW_TABS=0`.

This is trusted-command routing, not a sandbox. Do not override these controls or create tabs in v1. Bind each page script to the recorded target with public `Target.attachToTarget`. Follow the existing visibility, native-input, screenshot inspection, and per-script total-deadline requirements. No injected Python CDP API replaces that contract. Recording stays off in v1, even when requested. Source activation, shared BB state, and paid turns retain their separate approvals.

## Inspect cleanup and retained resources

The private `ledger.json` records partial acquisitions, both target roles, current ownership observations, command exits, and cleanup outcomes. It is evidence, not an adoption or recovery interface. Evidence survives cleanup.

Cleanup first stops and confirms quiescence of the owned verifier group. Fresh process/profile/listener, named socket/process/connection observations, and strict Doctor health must match the recorded identity before target mutation. The helper executes the existing documented cleanup snippet with its interrupting five-second total target deadline, true close acknowledgments, and complete target absence. It also checks for unknown pages before target cleanup and browser shutdown.

Only then does public `browser-use --reload` stop the still-owned named daemon. Strict Doctor and process/socket absence confirm shutdown. The helper sends SIGTERM only to its still-owned browser PID, confirms process/listener exit and no open profile files, and deletes the owned temporary root. It never kills by name or escalates to SIGKILL. One interrupting 45-second budget covers cleanup, including time reserved to quiesce a failed child.

Unknown pages, changed identity, missing provisioning IDs, false acknowledgments, or uncertain sent mutations retain affected resources and report `cleanup_pending`. No mutation is replayed. A partial browser launch can release only independently proven owned resources. Do not restart a default daemon or rerun provisioning to repair a failed run. Report retained paths and ask for scoped manual resolution.

Exit 0 means the verifier passed and cleanup completed. A nonzero verifier exit is preserved when cleanup completes. Cancellation exits 130 after completed cleanup. Invalid CLI syntax exits 2. Refused prerequisites, lifecycle failures, and pending cleanup exit 3. `status=cleaned` describes cleanup only and does not turn a failed verifier into a pass.

SIGKILL, host crashes, and loss of the foreground owner can bypass cleanup. There is no recovery service. Re-prove ownership and obtain any needed approval before manual cleanup. Fake-executable tests and static availability do not prove real Chrome visibility, macOS identity observations, or installed acceptance. Report those separately under [the report rules](report.md).
