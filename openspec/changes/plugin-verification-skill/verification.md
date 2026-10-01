# Verification

## Scope and current result

The repository-local skill is implemented at [`.pi/skills/verify/SKILL.md`](../../../.pi/skills/verify/SKILL.md), with [live-check guidance](../../../.pi/skills/verify/references/live-checks.md) and [the report format](../../../.pi/skills/verify/references/report.md).

The user explicitly requested a repository-local skill during apply. The proposal, design, and task 1.1 now reflect that decision. No global skill was created.

Baseline commit: `6f0abf5cdbde6025b24f1d8f6600e591f76ca9b5`. Validation dates: 2026-09-30 and 2026-10-01 UTC.

All fifteen tasks are complete. Static validation and instruction walkthroughs pass. The skill's one review finding was fixed and revalidated; the separately approved SDK update passed its scoped review without findings. The browser retry passed the bounded list-preference persistence/reset test against the exact worktree bundle. The original plugin source and sidebar selection were restored. This does not claim complete live PR-badge coverage.

## Tool and structure checks

| Check | Observation | Result |
| --- | --- | --- |
| Skill-creator initialization | Initialized `.pi/skills/verify/` with the bundled initializer. Removed its unused generated Codex UI metadata; only the three intended Markdown files remain. | passed |
| Skill-creator validation | System `python3` lacked PyYAML. Ran the unchanged validator with `uv run --no-project --with pyyaml python /Users/koen/.pi/agent/skills/skill-creator/scripts/quick_validate.py .pi/skills/verify`; exit 0, `Skill is valid!`. No project or system-Python dependencies were changed. | passed |
| Pi discovery | A fresh process called the installed Pi `loadSkills` with this repository as cwd and default discovery enabled. Exactly one `verify` skill resolved to `.pi/skills/verify/SKILL.md`, scope `project`, model invocation enabled. No verify diagnostics; the formatted skill prompt includes it. | passed |
| Relative references | All three links in the skill files resolve. No TODO placeholders or trailing whitespace. | passed |
| Global installation | `~/.pi/agent/skills/verify` and `~/.agents/skills/verify` were absent before implementation. No writes were made to either location. | passed |
| CLI command shapes | Checked installed help for `bb plugin types`, `build`, `install`, `reload`, `source`, and `browser-use`, `screenshot`, and `close`. Confirmed read-only `types --check`, explicit plugin ID reload, named browser sessions, and screenshot path support. | passed |
| OpenSpec | `openspec validate plugin-verification-skill --strict` exits 0. | passed |
| Working-tree whitespace | `git diff --check` exits 0; a separate check covers the new, untracked skill files. | passed |

The Pi discovery check exercises the real loader without making a model request or starting another agent. It does not reload the current conversation's resource list. Use `/reload` or start a fresh Pi session in this repository to expose the new command in the active session.

## Instruction walkthroughs

These are parent-performed walkthroughs against the written instructions, not browser runs, model forward-tests, or automated plugin tests. Each stimulus was traced through the relevant branch and its reporting rule. They check that the instructions prescribe the required behavior; they cannot prove that every future agent will follow it.

| Spec scenario | Stimulus and traced decision | Instruction location | Result |
| --- | --- | --- | --- |
| Multiple plugins are plausible targets | A request says "verify these changes" and two package diffs exist. Ask for package scope before installation rather than choose one. | SKILL step 1 | passed |
| Verifying a committed change | The tree is clean and the request names a commit. Use the named comparison and derive expected behaviors from it. | SKILL step 1 | passed |
| Build failure | A required build exits nonzero. Leave the current plugin installed, mark build failed and dependent live checks blocked, then report/clean up. | SKILL steps 2 and 5; report rules | passed |
| Package has no test command | `bb-task-board/package.json` has no scripts. Record unavailable automated coverage and continue applicable checks; do not claim tests passed. | SKILL step 2 | passed |
| Existing source is another worktree | Inventory points to path A and requested checkout is B. Show both, ask before switching, and include the intended final source. | SKILL step 3 | passed |
| Managed installation cannot be replaced safely | A managed installation contains settings, secrets, and schedules. Without approval, stop before removal. With approval naming those losses and the final installation, follow the supported replacement path and record the lost configuration as intentionally removed. Restoring the original source does not recover it. Report any failed replacement/recovery step and the actual final state. | SKILL step 3 and permission rules; report state ledger | passed |
| Reload preserves the previous working instance | Reload fails but inventory still shows an older healthy instance. Fail activation, block dependent live checks, and reject the older UI as evidence. | SKILL step 3; report rules | passed |
| Changed setting persists | Set a temporary preference through the UI, reload, observe the value, then compare and restore the original state during cleanup. | Live checks, browser steps 4–5; SKILL step 5 | passed |
| Browser session cannot authenticate | A clean session reaches a login screen. Ask for authentication in that session, keep the check blocked, and do not import cookies or switch to Arc. | Live checks, browser step 3 | passed |
| Theme has no frontend application entry | Liquid Glass declares `bb.themes` without `bb.app`. Select its browser-visible theme within the approved scope and restore the prior selection. | Live checks, themes | passed |
| Backend-only change | Code Cleanup declares only a server entry. Exercise the changed installed contract; explain why browser evidence is non-applicable. | Live checks, backend and CLI | passed |
| Check would start a thread | A test button invokes agent creation. Ask for permission for that bounded action and cleanup before clicking. | SKILL permission rules; live checks, external effects | passed |
| Live prerequisite is missing | No thread has the linked PR needed for a badge check. Keep live evidence blocked even when fixture tests pass. | Live checks, pages/sidebar; report rules | passed |
| Local checks pass but live data is unavailable | Tests/build pass, but the required live prerequisite is absent. Keep separate check rows and aggregate to blocked. | Report rules and examples | passed |
| Runtime error contradicts a screenshot | The page renders but the tested action errors. Fail the interaction, retaining the relevant diagnostics instead of counting the screenshot as success. | Live checks, browser step 7; report rules | passed |
| Temporary sidebar selection is restored | The current selection still equals the temporary selection written by verification. Restore the recorded original and confirm it. | SKILL step 5; state ledger | passed |
| User changes a setting during verification | Current preference differs from this run's temporary value. Preserve the newer value, report a conflict, and block overall success pending resolution. | SKILL step 5; report rules | passed |
| Verification fails after opening the browser | An interaction fails after test setup. Attempt approved data cleanup, close only the owned session, and report the failure and remaining state. | SKILL step 5; live checks, browser step 8 | passed |

Additional branch checks:

- Liquid Glass uses `check` instead of `typecheck`; command discovery follows the package rather than a fixed command list.
- An absent plugin may be installed only after its activation effects are inspected and fit the verification permissions.
- A disabled plugin or competing selection prompts for permission before activation.
- A source changed by another actor before installation prompts for reconciliation.
- An SDK mismatch stops before commands that might rewrite dependencies. The plugin README's rewriting `bb plugin types` command does not override this verification-only boundary.
- Missing host/account configuration blocks the affected host check without changing hosts or copying credentials.
- Report examples produce passed for complete evidence plus cleanup, failed for an executed runtime error, and blocked for unavailable live data or a cleanup conflict.

## Independent review

One fresh read-only reviewer examined the full task against the baseline, including all untracked files. Review run: `824bfb0d-8365-4f5a-b434-1bf47a5302b8`. Its verdict was request changes for one P2 approval-policy contradiction, not for the disclosed live-test blocker.

The parent resolved that finding by making the managed-replacement exception explicit and limited to approval naming the configuration losses and final installation. The report now distinguishes restoring a source from recovering deleted settings, secrets, and schedules. The managed-installation walkthrough above covers both denied and granted approval with existing configuration. No destructive replacement was performed. No second pass on the skill review was launched; the later SDK prerequisite has its own scoped review below.

Post-fix skill checks passed: the unchanged skill-creator validator, fresh Pi loader discovery, links and whitespace across all eight Markdown files, all 18 scenario mappings, strict OpenSpec validation, and `git diff --check`. At that checkpoint only the nine intended untracked skill/planning files existed and no tracked plugin files had changed. The later, separately approved dependency task is documented below.

## Separately approved SDK prerequisite

The initial read-only `bb plugin types <absolute-package-path> --check` failed with exit 1 because `bb-plugin-pr-thread-list` pinned SDK `0.5.9` while BB provided `0.5.29`. The user then explicitly approved updating the SDK dependencies in this worktree. This is separate from the skill's verification-only authority.

Changes are limited to `bb-plugin-pr-thread-list/package.json` and its lockfile. The SDK pin is now `0.5.29`. The new SDK brings `cross-spawn` and five transitive packages; no unrelated dependency versions, source code, tests, scripts, or engine declarations changed.

| Check | Observation | Result |
| --- | --- | --- |
| Dependency update | `bb plugin types` changed the SDK pin only; `npm install --include=dev --no-audit --no-fund` succeeded. | passed |
| Lockfile reproducibility | `npm ci --include=dev --no-audit --no-fund` installed 253 packages from the updated lockfile, exit 0. | passed |
| Existing test suite | `npm test`: 6 files and 36 tests passed, exit 0. Repeated after clean install. | passed |
| Typecheck | `npm run typecheck`, exit 0, repeated after clean install. | passed |
| Build | `bb plugin build <absolute-package-path>`, exit 0, repeated after clean install. App/server metadata reports SDK `0.5.29` and BB `0.44.0`. | passed |
| SDK-currentness | `bb plugin types <absolute-package-path> --check`, exit 0, package and host both `0.5.29`. | passed |
| Whitespace | `git diff --check`, exit 0. | passed |

The install reported the existing `prebuild-install@7.1.3` deprecation warning. No dependency-audit result is claimed. Build output and `node_modules` remain in this worktree as ignored development artifacts.

The single read-only completion review for this dependency task approved the update with no actionable findings. Review run: `c4e025ab-e918-49f9-955a-31fcd5adb8d3`. The reviewer independently confirmed the dependency-tree and lockfile scope, reran strict typecheck and whitespace checks, and inspected the retained test/build/SDK logs. It did not re-review the original skill or claim the blocked live integration was complete. Older-host compatibility and a security audit remain untested.

## Live integration

### Initial attempts, superseded by the successful retry

The first browser attempts were blocked before any installation change. `browser-use doctor` passed, but managed browser discovery failed with `No local browser path found after: uvx playwright install chromium`. Dedicated full Chrome for Testing 153 and 149 sessions then timed out navigating to BB and returned empty DOM state. An independent HTTP request returned 200 HTML with title `bb`, which only established server reachability.

`browser-use install --help` unexpectedly ran its installer instead of printing help and reported a successful Chromium installation. The owned sessions/processes/profiles from those attempts were cleaned up. Browser downloads remain in the normal tool cache; the user's system Chrome shortcut was not changed.

### Successful retry

The retry identified a dangling `/Applications/Google Chrome.app` symlink pointing to the absent cached `chromium-1208` bundle. It used an existing Chrome headless-shell executable from `chromium_headless_shell-1223` with a new temporary profile and loopback CDP port. Actual browser: `HeadlessChrome/148.0.7778.96`. All interactions ran through the named `browser-use` session `verify-pr-thread-list-retry-Bntajo`. No Arc or personal browser profile, copied cookies, cloud browser, or tunnel was used.

The user-approved scope was the committed list-preference behavior in `pr-thread-list`: change grouping, reload, reset, and restore. A usable BB page was confirmed before changing the plugin installation.

| Check | Observation | Result |
| --- | --- | --- |
| Exact checkout activation | Rechecked the original source, installed this worktree's package with the approved local source switch, and confirmed enabled/running status and the exact worktree path. | passed |
| Loaded bundle identity | BB advertised SDK `0.5.29`, asset hash `2b0f3fe7e33e18f0`. Browser resource timing showed its JS/CSS loaded with HTTP 200. Downloaded JS bytes exactly match this worktree's `dist/app.js`, SHA-256 `2c3528dc0e9284b47128ca9f1e97881fa0960e67b9f065adbdb8fc16e9e826a3`. | passed |
| UI action | Selected Threads with PRs in Appearance, returned to the main BB page, opened List options, and changed Group by from Project to Machine through the native select. | passed |
| Persistence | Reloaded BB and observed `mode=machine` in both the rendered select and stored preferences. Sort remained Last updated and direction Descending. | passed |
| Reset regression | Clicked Reset list preferences. Project grouping, Last updated sort, Descending direction, and the other original defaults were restored and remained after a second reload. | passed |
| Runtime diagnostics | The selected plugin remained running and its log was empty before and after the check. A CDP observer captured no uncaught runtime exceptions; a harmless debug-event probe confirmed delivery. A separate plugin asset warning is disclosed below. | passed for the tested plugin |
| Cleanup | Restored Dockside (projects), confirmed it after reload, restored the original plugin source and enabled/running state, and closed/deleted only owned browser resources. | passed |

Evidence:

- [Machine grouping after reload](evidence/preferences-machine-after-reload.png)
- [Reset to original defaults](evidence/preferences-reset.png)
- [Sanitized observations, bundle proof, and cleanup record](evidence/live-check.json)

The screenshots capture only the preference controls, without unrelated thread content. The persistence and reset comparisons in `live-check.json` were asserted against the recorded observations before saving.

### Limits and independent warning

This is one bounded installed-runtime smoke test for the verification skill and the SDK prerequisite update. It does not establish every plugin behavior. Live PR badge states, external Git-host responses, and older BB versions were not exercised. The existing automated suite covers additional behavior separately.

The browser reported a 404 for `/api/v1/plugin-app-assets/0a89cb5240a85678/app.js`. The installed-plugin inventory identified that hash as `tenet-status`, a different plugin. The tested `pr-thread-list` JS/CSS returned 200 and its preference interactions passed. This independent asset issue was not repaired or hidden; no claim of an error-free entire BB instance is made.

## Cleanup and final state

- `pr-thread-list` is restored to `path:/Users/koen/workspace/bb-plugins/bb-plugin-pr-thread-list`, enabled and running. Rechecked the temporary source before restoring it so another actor's change would not be overwritten.
- Restored the test client's previous Dockside (projects) sidebar selection and confirmed it after reload. Reset list preferences to their initial values; the newly created profile and its storage were then removed.
- The original checkout's `package.json` and lockfile hashes match their pre-test values. Only this worktree retains the separately approved SDK dependency update.
- Closed only `verify-pr-thread-list-retry-Bntajo`, confirmed it was absent from the session list, and confirmed the owned Chrome process exited. Removed the temporary profile and raw snapshots from `.pi/verify-run.Bntajo`.
- No user records, threads, PRs, or messages were created, and no existing plugin was removed or disabled.

Earlier local-check logs remain in `/tmp/bb-verify-pr-thread-list.n5BA0m/` and may expire. Durable, sanitized retry evidence and the two cropped screenshots are retained in this change's `evidence/` directory.
