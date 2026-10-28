---
name: verify-bb-plugins
description: Verify this repository's BB plugins with package checks, owned browser fixtures, and exact-checkout installed acceptance. Use for any of its 13 plugins, including chat styling, quota, files, tasks, PRs, annotations, MCP, or Pi provider behavior. Read the plugin feature map and report fixtures separately from live acceptance.
---

# Verify BB plugins

Invoke `/skill:verify-bb-plugins` with a plugin directory, commit, or OpenSpec change. Read [the feature index](features/README.md), then every affected plugin map. Resolve target packages from changed manifests/source; ask if the request cannot establish scope. This verifies and reports. Plugin repairs, SDK migrations, publishing and delegation require separate instructions.

BB is the real application. This checkout contains 13 plugin packages, not BB's server. Most user interactions need an installed desktop/web BB instance. Four packages have independently owned ephemeral-port browser runners; Code Cleanup has an isolated Settings preview. Unit and SDK-harness tests are not user-path or installed acceptance.

## Launch

Use Bun 1.4.4 and Node `>=26.0.0 <27`. Start at the repository root. Inspect package scripts/lifecycle hooks before execution. Set the selected package and a new private evidence directory:

```sh
SKILL="$PWD/.pi/skills/verify-bb-plugins"
PLUGIN=compose-chat
PACKAGE="$PWD/bb-plugin-$PLUGIN"
EVIDENCE="${BB_THREAD_STORAGE:-/tmp}/bb-plugin-proof-$PLUGIN-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -m 700 "$EVIDENCE"
```

Choose `PLUGIN` from the index, not an installed catalog name. Follow its additional prerequisites before checks. GitHub Insight needs its sibling PR thread-list dependencies. Tasks Plus needs SQLite, the built local Markdown package, Quota fixture dependencies, and its pinned TypeScript 7 compiler. Do not use generic setup to bypass these requirements.

After the package-specific prerequisites are available, install workspace dependencies from the root lockfile and build shared Markdown:

```sh
bash .bb-env-setup.sh
```

After successful setup, run tests and typecheck separately so a test failure does not skip typecheck:

```sh
bun run --cwd "$PACKAGE" test > "$EVIDENCE/tests.log" 2>&1
TEST_EXIT=$?
bun run --cwd "$PACKAGE" typecheck > "$EVIDENCE/typecheck.log" 2>&1
TYPECHECK_EXIT=$?
printf 'tests=%s typecheck=%s\n' "$TEST_EXIT" "$TYPECHECK_EXIT" > "$EVIDENCE/check-exits.txt"
```

Record both exit codes. Either failure blocks dependent installed activation. Do not suppress a failing check or upgrade dependencies to make setup pass.

For Compose Chat, Codex Quota or Markdown Reader, install the package's pinned Chromium, then run the existing browser suite through the evidence wrapper:

```sh
(cd "$PACKAGE" && bun --bun run playwright install chromium)
"$SKILL/scripts/browser.sh" "$PLUGIN" "$EVIDENCE/browser"
```

Browser setup may download binaries and remove obsolete Playwright cache versions. The runner starts the current checkout at a fresh `127.0.0.1` port `0`, waits for `BB_FIXTURE_READY`, launches owned Chromium contexts and cleans its process groups/cache. Each package compiles its own fixture source, with no sign-in or installed BB. Do not invoke raw Playwright for these packages because it lacks the required origin handoff. For Tasks Plus, use its map's package runner and private-capture config with the same origin handoff. For Code Cleanup, use its map's preview isolation rules.

For installed behavior, read and follow [the preserved installed workflow](references/installed-workflow.md) in full. It owns SDK checks, exact-source build/install/reload, state ledger, approval gates and restoration. Do not start another BB server or replace a user's plugin source as a fixture setup step. Read the package's deployment/migration guidance before activating it.

## Doctor

Run Doctor first whenever something looks wrong, before repeating an action.

- Browser fixture: require the runner's readiness handoff, actual loopback origin and current-checkout log. Its config refuses missing handoff and never reuses a listener. Inspect `browser/command.log` and `checkout.txt`; wrong identity blocks driving. For a live Markdown Reader smoke preview, `scripts/doctor.sh PREVIEW_PID ORIGIN` also checks process working directory, listener ownership and the fixture title.
- Installed BB: `bb status --json`, `bb plugin list --json`, and `bb plugin source "$PLUGIN" --json`. Use `pi-subagents-provider` as the plugin ID for that package. Resolve IDs from manifests/source, not names. Healthy status alone does not establish current build identity. Follow the installed workflow's artifact/activation check.
- Package-specific: the maps add read-only checks such as `bb mcp status --json`, `bb code-cleanup show`, theme inspection, selected host/account identity, GitHub host authentication, and provider catalog identity. Missing auth, host access or native UI is a blocker, not permission to repair unrelated state.

## Drive

Use the mapped user entry points and stable accessible names. Perform actions before observing state. For a quick complete production-reader local proof:

```sh
"$SKILL/scripts/verify.sh" "$EVIDENCE/markdown-smoke"
```

That executable owns launch → Doctor → keyboard Preview/Raw activation → screenshot/ARIA/trace capture → cleanup. See [its exact recipe](references/markdown-reader-local.md). It is not the default proof for unrelated plugins.

For the three owned browser runners, `browser.sh` accepts existing spec names or Playwright filters after the evidence directory. Read the plugin map before selecting a subset. The maps identify real Settings, page, sidebar, file opener, CLI, HTTP/MCP and provider entry paths for installed checks. A convenient fixture path does not cover another listed native entry. Do not inject passing internal state or call private setters to replace the interaction being tested.

## Evidence

Keep setup/check logs, checkout commit and working tree, selected instance/host, actions and resulting state, screenshots/ARIA where supported, browser traces and structured assertions under `EVIDENCE`. The browser wrapper puts HTML/JSON reports and per-test files in its own new subdirectory and records the actual command exit code. Never overwrite a prior run.

Read [the report and state-ledger rules](references/report.md). Track each mapped entry as passed, failed, blocked or not run. A unit pass, local fixture pass, built artifact, exact-source activation, live user action and successful cleanup are separate rows. Scope an overall pass explicitly; never infer installed acceptance from fixtures. Missing external accounts, permissions, signed-in browser access or proof of current build identity keeps the required installed checks blocked.

Capture both the action and result. Verify side effects through a second read of the owned file, stored setting/task, draft, submitted review or operation result. Retain source hashes for read-only checks and zero-send observations for draft-only actions. Mocks belong only at existing external boundaries and must be named. A dry-run name is not evidence of no network, browser, file or Git-ref effects; observe those effects. Keep tokens, private transcripts and unrelated user data out of retained evidence.

## Cleanup

Read [the installed workflow](references/installed-workflow.md) and [browser contract](references/browser-contract.md) before live actions. Restore only approved settings/source selections that still equal what this run wrote. Preserve concurrent user changes. Delete only owned records within the agreed cleanup scope. Installing a separate browser does not isolate BB's shared database.

Local runners tear down only their owned processes/contexts and temporary directories on success, failure or cancellation. Never kill by process name or reuse another listener. Tasks Plus also binds an OS-assigned loopback port and forbids reuse. A Code Cleanup preview must have its recorded PID and its own chosen port. SIGKILL/host crashes bypass ordinary teardown; verify recorded ownership before manual recovery.

Proof artifacts survive cleanup. Confirm the owned PID/listener/cache is gone where observable, the command exited correctly, and expected logs, screenshots, traces/results still exist. Failed or pending cleanup prevents an overall pass. Do not remove evidence or reset unrelated source changes.

## Helpers

All shipped scripts are executable; run from the root as shown above:

- `scripts/browser.sh PLUGIN NEW_EVIDENCE_DIRECTORY [PLAYWRIGHT_FILTERS]` runs existing owned suites for Compose Chat, Codex Quota or Markdown Reader. It does not install dependencies or activate plugins.
- `scripts/verify.sh NEW_EVIDENCE_DIRECTORY` runs the Markdown Reader smoke proof only.
- `scripts/doctor.sh PREVIEW_PID ORIGIN` checks that live smoke preview read-only.
- `node "$SKILL/scripts/prove.mjs" "$ORIGIN" "$EVIDENCE"` drives a smoke preview already owned and checked by this run. `verify.sh` calls it automatically. It closes its browser in a finally block.

Use `/maintain-verification-skill` when available to update the maps as plugins change. Add a new package to the index with observed launch, driving, ownership and proof requirements before calling it covered.
