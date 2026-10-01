---
name: verify
description: Verify changed BB plugins with local checks, exact-checkout installation, and installed behavior checks in a dedicated Chrome session. Use when asked to verify a BB plugin, test its installed behavior, or confirm a plugin change works end to end. Report evidence and coverage gaps without repairing the plugin.
---

# Verify BB plugin changes

Invoke with `/skill:verify <plugin-path, commit, or OpenSpec change>` from this repository. Resolve missing scope from the request before acting.

This workflow verifies and reports. Code fixes, SDK migrations, dependency upgrades, publishing, and agent delegation require separate instructions. Use the current BB instance by default. Browser-visible checks use dedicated local Chrome or Chromium, not Arc.

## 1. Define the checks

1. Resolve the package directory, plugin ID, checkout, and requested change. Inspect the manifest, README, relevant source/tests, and applicable OpenSpec scenarios. Include untracked changes when they belong to the request. A clean working tree can still contain the committed change being verified.
2. If several packages or comparison bases are plausible, ask which to verify before installation. For multiple selected packages, keep separate checklists and installation records.
3. Load `bb-cli` and its plugin-management reference, plus the relevant `bb-plugin-authoring` quickstart/testing references. Use installed CLI help for current flags and command behavior. If a required tool or skill is unavailable, report the prerequisite instead of substituting an unverified workflow.
4. Resolve the BB instance, project, environment, and relevant host with `bb status --json`. Check any explicit server/host overrides. Do not change instances silently.
5. Read [the report and state-ledger format](references/report.md). Create a per-run evidence directory outside tracked plugin source. Restrict local access to logs and snapshots; keep tokens and unrelated private content out of retained or shared evidence.
6. Give each required behavior an expected result, check method, prerequisites, and evidence target. Include relevant persistence, failure-state, and nearby regression checks. Identify genuinely non-applicable checks separately. Keep required checks required when prerequisites are missing.

Done when the target is unambiguous and every changed behavior has an observable check. Announce the target, scope, planned live actions, and intended final installation before mutation.

## 2. Check the package locally

- Record the checkout commit and initial working-tree changes. Inspect package scripts and lifecycle hooks before executing them; apply the permission rules below to tests and setup as well as live actions.
- Discover the package's tests, type checks, and other applicable validation from its scripts and README. Use its lockfile/package manager. Restore missing dependencies only with a frozen-lockfile operation that preserves declarations and lockfiles. If setup requires source or dependency changes, report a blocked prerequisite and ask for separate work.
- Run discovered checks with their exit codes and useful failure output. An absent test command means unavailable automated coverage, not a passing test. Continue other applicable checks.
- Inspect `bb plugin types --help`. When supported, run `bb plugin types <absolute-package-path> --check`, which is read-only. A mismatch or requested migration blocks activation; do not run the rewriting form or migrate. Require this check to pass before a build/install that might synchronize SDK dependencies.
- Run `bb plugin build <absolute-package-path>` when the prerequisites permit it. Preserve build metadata and compare source/lockfile state with the baseline afterwards. Build output is expected; unexpected source changes are not. Stop and report them without resetting the user's work.

Done when all required local checks pass. On a required failure, keep the existing installation untouched, mark dependent live checks blocked, and proceed to cleanup/reporting. Distinguish a demonstrated code failure from an unavailable environment prerequisite.

## 3. Activate the exact checkout safely

Inspect `bb plugin list --json` and, for an installed target, `bb plugin source <id> --json`. Record the original source, enabled state, runtime status, and only the non-secret settings the checks will touch in the state ledger.

| Installation | Next action |
| --- | --- |
| Absent | Announce a local install and inspect activation/setup effects. Install within the verification request only when those effects fit the permissions below. |
| Enabled, same local source | Rebuild and reload only the selected plugin ID. |
| Different local source | Show both paths and ask before switching. Include whether to leave the verified source installed or restore the original. |
| Managed Git/npm source | Inspect the supported replacement path. If removal is required, ask for explicit destructive approval naming the settings, secrets, and schedules that will be lost and the intended final installation. Explain that reinstalling the original source cannot recover that configuration. Without this approval, block replacement or ask for another target. |
| Disabled or competing plugin | Ask before enabling it or replacing the competing selection. |

Use the resolved absolute package path, not a catalog name or another checkout. Recheck the source and state immediately before mutation. If they changed, reconcile with the user. Do not reload all plugins or use removal as an install/cleanup shortcut. `--yes` supplies an already-established approval; it does not grant permission.

After activation, confirm the installed source, current runtime status, and successful activation evidence. Compare available build/generation metadata and refresh stale browser pages. Observe behavior attributable to this checkout. An unchanged package version or an older instance retained after reload failure is insufficient. Failed activation fails the activation check; uncertain source identity blocks dependent live checks.

Done when the changed checkout is demonstrably active. Otherwise report the failure/blocker and clean up.

### Permission rules

Ask before source switches, enabling disabled plugins, competing-plugin replacement, destructive actions, agent/thread creation, external messages, publishing, paid operations, or unrelated user-state changes. Inspect automatic install hooks and background services for these effects too.

Use read-only observations or bounded, owned test records. Define and obtain any required approval for setup and cleanup together. Touch only settings needed by the announced test; record how to restore them. Do not delete pre-existing records to manufacture test prerequisites or remove unrelated user data. The managed-replacement branch above is the sole exception for deleting an existing plugin's configuration, and only under its specific destructive approval. It is not permission for automatic cleanup removal. A separate browser session still shares BB's server and database.

Leave the verified plugin installed by default and disclose this before installation. A source-switch approval must specify the final source. Retained worktree sources may disappear when their owning thread/environment is retired; flag that risk.

## 4. Exercise installed behavior

Read [live checks](references/live-checks.md) for every run. Follow only the branches affected by the change. For browser-visible behavior, also load `browser-use` and its multi-session reference before opening a dedicated local Chrome-family session.

Perform the intended interaction and compare the result with the checklist. Use installed CLI/RPC/host checks where appropriate. Page reachability, a build, or an installed status alone does not establish behavior. Keep automated fixtures separate from live evidence; missing accounts, hosts, linked PRs, permissions, or browser access leave the affected required checks blocked.

Done when every required check has an observation or a specific failure/blocker. Keep failed cases in the report rather than weakening the acceptance criteria.

## 5. Clean up and report

On success, failure, or a mid-run blocker, attempt the approved cleanup before concluding:

- Compare each current setting with the temporary value in the ledger. Restore its original value only if it still matches the value set by this run. Preserve concurrent user changes and report the conflict.
- Remove only owned test data and temporary files covered by the cleanup approval. Retain safe evidence promised in the report.
- Close only the named browser session and processes this run created. Never close every browser session. Complete any source restoration included in the approval, subject to the same concurrency check.
- Confirm the final source, enabled state, temporary selections, and remaining test data. Pending cleanup prevents an overall pass.

Complete the report using [the result rules](references/report.md). Lead with the overall result, then link evidence, name coverage gaps, and state what remains installed. Ask one specific question if approval or missing access blocks further work.
