# Design

## Context

See [proposal.md](proposal.md) for motivation and [the capability spec](specs/plugin-verification/spec.md) for the behavior contract.

This repository contains separate BB plugin packages with different check commands. Most declare tests and type checks, Liquid Glass uses `check`, and Task Board declares no package scripts. Liquid Glass contributes visible theme behavior without a `bb.app` entry. Code Cleanup has no frontend page. A general workflow must inspect behavior as well as the manifest.

The existing sidebar verification report records a useful limitation: the installed list rendered, but no live thread had a PR, so real badge behavior remained untested. Automated fixture results cannot close that live coverage gap.

BB's plugin references distinguish local path reloads, local path source switches, and managed Git/npm installations. Local source switches preserve configuration; removal can delete settings, secrets, and schedules. Reload failures can leave the old instance running. Installed sources observed during exploration included other worktrees and managed Git revisions.

`browser-use doctor` passed during exploration. No browser session or live plugin check was performed. The user approved using the current BB instance and Chrome instead of Arc, with approval gates for source switches and destructive actions.

## Goals / Non-Goals

**Goals:**

- Keep the skill small enough to follow while making approval, evidence, and cleanup decisions explicit.
- Reuse installed tooling and package documentation instead of maintaining a second BB command manual.
- Support UI, theme, CLI, backend, and host changes without inventing unnecessary checks.

**Non-Goals:**

- A new test runner, browser integration, isolated BB server, or plugin-specific fixture framework.
- Automatic code fixes, dependency upgrades, SDK migrations, releases, or delegated agent work.
- A custom `/verify` slash-command extension. Pi's standard invocation is `/skill:verify`.

## Decisions

### 1. Use a repository-local instruction skill

Create `.pi/skills/verify/SKILL.md` with a BB-specific description even though its short name is `verify`. Keep it model-discoverable for explicit plugin-verification requests and callable through `/skill:verify <plugin-or-change>`.

The user explicitly chose repository-local installation during apply, replacing the earlier user-wide assumption. Keep the skill and OpenSpec artifacts versioned together. Check for a name collision before writing. Create no global copy; updating an unrelated existing skill requires a separate decision.

The main file owns the ordered workflow and completion gates. A short `references/live-checks.md` can hold conditional UI, theme, CLI, and host guidance. A `references/report.md` defines the evidence table and state ledger. Add no executable helper in the first version unless implementation reveals a repeated operation that cannot be expressed reliably with existing tools.

Alternative: a shell script that builds and launches a browser. It cannot decide which user behavior matters or safely handle the different installation sources. A user-wide skill was rejected by the user in favor of keeping this workflow in the repository.

### 2. Build an evidence checklist before changing the runtime

Resolve the package and diff or acceptance scope. A clean working tree does not rule out a committed change. Inspect the package README, manifest, relevant source and tests, and applicable OpenSpec scenarios. Ask only when the target or comparison remains ambiguous.

For each changed behavior, record the expected result, check method, prerequisites, and evidence to collect. Include a nearby regression or failure-state check when the change warrants one. Separate unavailable automated coverage from required installed acceptance.

Load the existing `bb-cli` and relevant `bb-plugin-authoring` references for live work. Load `browser-use` for browser branches. Use current command help for flags; avoid hard-coded local URLs, machine IDs, installation paths, or SDK versions.

### 3. Make installation a guarded transition

Run the package's applicable checks, the read-only SDK check when supported, and `bb plugin build` against the selected package. Inspect scripts before executing them for unexpected side effects. Use the lockfile's package manager to restore missing dependencies without upgrading declarations or lockfiles. If this requires changing tracked source or configuration, report the prerequisite instead. Build output is expected; record any unexpected working-tree changes.

Capture `bb status`, the selected plugin's inventory/source, enabled state, and the settings that the planned checks will touch. Keep secrets out of this ledger.

| Current installation | Action |
| --- | --- |
| Absent | Announce the target and effects, then install the selected local package within the verification request. Gate any setup with additional risky effects. |
| Same local source, enabled | Build and reload only that plugin. |
| Different local source | Ask before switching; identify both paths and the proposed final source. |
| Managed Git/npm source | Explain the supported replacement path and its consequences. Block if safe replacement is unavailable; never remove as an automatic workaround. |
| Disabled or competing plugin | Ask before enabling it or changing the competing selection. |

Use an absolute package path. Recheck the installed source immediately before changing it; if another actor changed it, stop and reconcile. After activation, confirm the source and runtime status, inspect available build or activation metadata, reload stale pages, and observe behavior that distinguishes the changed code. A version string alone is insufficient when local changes retain the same version.

Leave the verified installation in place by default and disclose that outcome before installation. A source-switch approval includes whether the previous source will be restored. Restore temporary UI selections and test settings separately; do not uninstall just to make cleanup look complete.

### 4. Use a dedicated local Chrome-family browser session

Use `browser-use` with a unique session name on every command. Prefer a clean managed Chromium session or a dedicated Chrome debugging session supported by the installed CLI, and report the actual browser used. Do not attach to Arc, reuse an unrelated default automation session, import personal-profile credentials, start a cloud browser, or open a tunnel automatically.

If authentication or Chrome attachment requires user assistance, report a blocker and ask for that specific help. Chrome session isolation does not isolate the server, plugin database, or shared settings.

Navigate through BB's actual interface. Refresh element state before using indices, wait for observable UI states, and capture screenshots with explicit local file paths. Store large snapshots and logs in files and extract only relevant evidence. Use JavaScript inspection for observation, not to fabricate application state or bypass the interaction being tested.

Use browser diagnostics supported by the installed tool and the selected plugin's runtime logs. Missing access to console or network diagnostics is a disclosed limitation, not evidence that those channels contain no errors.

Alternative: reuse Arc's signed-in session. Rejected because the user explicitly permitted Chrome for this workflow and a dedicated session avoids disrupting personal tabs.

### 5. Adapt checks to the affected behavior

- UI and sidebar changes: perform the changed interaction, check its visible outcome, and refresh or reopen where persistence matters.
- Themes and content scripts: explicitly select or activate the contribution, inspect the affected host UI, and restore the prior selection. Do not infer lack of UI from absence of `bb.app`.
- Backend and CLI changes: run a scoped installed command or documented RPC and compare its result with the expected contract. Do not require a meaningless screenshot.
- Host-backed changes: use the selected enrolled host and report missing host, account, or configuration as a prerequisite blocker.
- Actions that start agents, spend money, send messages, or mutate existing records: require specific permission. Use bounded owned test records with approved cleanup where available.

Do not create linked PRs, launch threads, or alter private accounts merely to fill a coverage gap. Fixtures can demonstrate automated behavior but must remain distinct from real installed evidence.

### 6. Finish with a report and scoped cleanup

Keep a state ledger with the original value, temporary value, ownership, and intended final state for each mutation. On both success and failure, restore only values still matching the temporary state set by verification. Leave concurrent changes alone and report the conflict.

Close only the named browser session and owned processes. Remove only approved test records and temporary files; retain the evidence promised in the report. Use a per-run artifact directory outside tracked plugin source, with restricted access for sensitive local logs. Link only safe evidence, avoiding tokens and unrelated private content.

The report contains:

- Plugin, source checkout, change scope, installed source, BB target, and actual browser.
- One row per required check: expectation, observation, passed/failed/blocked result, and evidence.
- Explained non-applicable checks and unavailable optional diagnostics.
- Failures and blockers, with product defects distinguished from environment prerequisites.
- Cleanup result and final plugin source, enabled state, and any remaining temporary state.

Overall precedence is failed, then blocked, then passed. Treat failed cleanup as a failure and cleanup awaiting permission or conflict resolution as blocked. A partially checked change must not receive an unqualified success statement.

## Risks / Trade-offs

- Shared BB state can affect other threads. Mitigate with explicit source-switch approval, scoped actions, a state ledger, and a recheck before mutation.
- Worktree sources can disappear after a thread is retired. Report any retained worktree source so the user can move it to a durable checkout later; do not silently switch sources during cleanup.
- Live data may not cover every scenario. Keep required checks blocked and retain separate automated evidence.
- Tool versions and CLI behavior change. Read installed help and reuse existing skill references instead of embedding command catalogs.
- Project-local discovery limits automatic availability to this repository. Reuse across other repositories requires a separate installation decision; no global synchronization is part of this change.
- Agent-followed instructions are not enforced transactions. Test the approval and failure branches with scenario walkthroughs in addition to one bounded live run.

## Migration Plan

No plugin API or data migration is needed. Create and validate the skill under `.pi/skills/verify/`, then reload Pi's skills or start a fresh session in this repository to confirm discovery. Include the repository-local path in the completion report.

For rollback, remove only the new skill directory created by this change, or restore a backed-up version if an update was separately approved. Skill rollback does not undo a plugin verification run; each run's report and state ledger define its runtime cleanup.

## Approved integration prerequisite

During apply, the read-only SDK check found `bb-plugin-pr-thread-list` pinned to SDK `0.5.9` while BB provides `0.5.29`. The user separately approved updating this plugin's SDK/type dependencies in the worktree so the live test can proceed. This is a bounded prerequisite task, not an expansion of the `verify` skill's authority to repair plugins automatically. Keep unrelated plugin code and packages unchanged. The existing approval covers a temporary local-source switch and restoration to the original source after the browser check.
