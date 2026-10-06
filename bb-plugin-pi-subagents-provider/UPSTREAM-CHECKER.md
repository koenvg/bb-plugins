# Read-only upstream check

## Current gate

This source adds a checker, a copied-script wrapper generator, and a read-only setup planner. It creates no schedule. Installation and reload create no schedule either.

Stable server-host source placement and scheduling still need operator decisions. The installed durable fork at `c22ddcd4a35408ed23a37176f1b90633c81162f1` does not contain this checker. This worker and the parent's temporary worktree are not schedule sources. No automation ID or next run exists for this work. BBP-70 remains a recorded dependency. Source tests do not prove installed acceptance or enabled scheduling.

## Checker behavior

Run the command only from a trusted local copy after source review:

```sh
node /ABSOLUTE_SOURCE/bb-plugin-pi-subagents-provider/src/upstream/cli.ts \
  --source /ABSOLUTE_SOURCE/bb-plugin-pi-subagents-provider \
  --project proj_gjz4e6jtmg
```

`npm run check:upstream -- --source ABSOLUTE_PACKAGE_PATH --project proj_gjz4e6jtmg` is equivalent. Node 24.15.0 or newer within Node 24 and Git are prerequisites. The checker uses Node's native TypeScript support. It does not need installed plugin dependencies or a model. These examples are instructions for later approved use, not evidence of a run here.

The checker reads `HEAD:bb-plugin-pi-subagents-provider/UPSTREAM.json` with read-only Git commands. It ignores an uncommitted baseline. Other dirty work stays untouched. The scheduled wrapper takes a stricter approach and refuses uncommitted baseline/checker prerequisites before it executes the checker. Raw content checks also catch dirty files hidden by Git index flags.

Git reads remove all inherited `GIT_*` repository, index, object, discovery, and configuration overrides. They disable system/global Git configuration for the subprocess, optional locks, and the filesystem monitor. The copied wrapper applies the same isolation before any Git command. This does not edit Git configuration or change the caller's environment.

The committed record supplies the GitHub repository, tracked branch, incorporated revision, provider directory, and watched contract paths. The branch head is resolved once. Every later request uses that fixed revision. The checker verifies baseline ancestry and complete commit pagination. It reads each commit's paginated file list, including both names of a rename. It independently compares complete first-parent and current trees and rebuilds every Git tree SHA-1 hash. Missing tree entries or file entries therefore cannot become a silent no-change result. Commits that later revert still appear in a relevant report.

- Relevant changes produce one JSON report on stdout, exit 0, with `status: review-required`, baseline/head revisions, and affected commit/path pairs. Human review is required.
- A complete no-relevant-change result exits 0 with empty stdout and stderr. BB records this as a silent skipped tick. No agent starts.
- Missing or invalid provenance, unavailable data, rewritten history, network errors, refused access, rate limits, malformed pages, missing paths, and exhausted bounds produce an `inconclusive` JSON record on stderr and exit 1. This never means "up to date". Error output excludes remote error bodies, credentials, and transport exceptions.

## Bounds and watched-path limits

Requests are credential-free HTTPS GETs to `api.github.com`. Redirects are refused. Pagination links must stay on the requested endpoint and advance by one page. There are no retries, upstream checkouts, archives, private checkout requirements, or downloaded source execution.

Per run, limits are 256 requests, 20 pages per comparison or commit, 2,000 comparison commits, fewer than 3,000 files per commit, fewer than 100,000 recursive tree entries, 90 seconds total, 10 seconds per request, 4 MiB per response, and 32 MiB total response data. Tests can lower limits, not raise them. Git reads have a five-second timeout and 1 MiB output bound. No disk cache is used. Immutable tree data stays in bounded run-local memory, outside project source. Unauthenticated GitHub rate limits can stop a large comparison earlier. This is a failed/inconclusive run, not a no-change result.

The path list is reviewed provenance data, not a complete transitive dependency graph. Reports include only the provider directory and exact recorded contract files or directory descendants. They do not establish compatibility with all other BB paths. Paths with control characters, paths longer than 512 characters, non-SHA-1 histories, oversized trees, and incomplete GitHub responses fail closed. Contract-path coverage must be reviewed during incorporation.

The checker does not write files, Git objects/refs/index, the baseline, dependencies, provider settings, or schedules. It does not fetch into the project `.git`, checkout, merge, cherry-pick, push, open a PR, install, or change a provider. Git status uses optional locks disabled and the filesystem monitor disabled. Tests use owned repositories and settings/dependency fixtures only.

## Read-only setup planning

`planWeeklyCheck({ projectId, serverHostId }, ports)` returns a plan. Its injected ports can only list sources, inspect a source, and list schedules. No write-capable adapter or automatic setup hook exists. Wrapper generation is private to the validated planner; callers obtain the script from its plan.

Before later approved setup, build normalized inventory from supported BB project-source and automation reads. The planner's input is not the raw BB CLI JSON contract. The caller must provide:

1. The explicit project and actual BB server host, not the worker host by assumption.
2. A complete source inventory, with one project source on that server host. Durability is an explicit operator attestation. Reject a retirement deadline, a linked worktree, a thread/worktree path, missing source, symlinked source/prerequisites, or ambiguous candidates.
3. `inspectStableSource` results from that host. All baseline/checker modules and the package manifest must exist, be committed, and match committed bytes. A bare local path without this inspection is not a ready source.
4. A complete project schedule inventory with stored script bodies. BB `list` alone does not contain those bodies. Resolve each record through supported `show` and file reads. Keep damaged records visible. Failed pages or unreadable scripts make the inventory incomplete.

The reserved name and copied-script marker are `bb-pi-upstream-monitor:v1 PROJECT_ID`. A record with either marker is an ownership candidate. Zero candidates permit a `create-after-approval` plan. One exact candidate returns `reuse`, including its paused state. Multiple candidates, damaged records, a different project, changed cron/source/body, or uncertain ownership block setup. The planner never replaces, resumes, updates, or runs a record. Serialize any later approved application of a plan and refresh the full inventory immediately before creation. There is no atomic scheduler write adapter in this source-only change.

The planned default is script mode, Bash, Monday 09:00 UTC, cron `0 9 * * 1`, explicit project scope, and working-directory policy `automation-storage`. The copied wrapper pins an absolute stable source and checks its project and committed prerequisites. It does not depend on the storage cwd or a thread environment. It calls only the local checker.

## Later explicit scheduling

Do not execute these write examples under source-only approval. First settle stable-source placement, integrate and review the checker there, inspect the server-host Node/Git prerequisites, and obtain explicit schedule approval. Save the planner-generated wrapper outside project source on the confirmed server host. Inspect complete ownership inventory before creating anything.

For a new owned record only, an approved operator can use the installed CLI contract:

```sh
bb automation create --project proj_gjz4e6jtmg \
  --name 'bb-pi-upstream-monitor:v1 proj_gjz4e6jtmg' \
  --cron '0 9 * * 1' --timezone UTC \
  --script-file /APPROVED_SERVER_PATH/upstream-weekly.sh --host SERVER_HOST_ID \
  --interpreter bash --timeout 120s --working-directory automation-storage --json
```

If the planner returns `reuse`, keep that ID. Do not create a second record or enable a paused record without approval. Record the returned ID, resolved stable source, source commit, stored script path/body, cron/timezone, enabled state, and verified Monday 09:00 UTC next run. None of that activation evidence exists yet.

## Run output, changes, and rollback

Use explicit project scope for all automation commands. After scheduling is separately approved:

```sh
bb automation show AUTOMATION_ID --project proj_gjz4e6jtmg --json
bb automation runs AUTOMATION_ID --project proj_gjz4e6jtmg --json
bb automation runs AUTOMATION_ID --project proj_gjz4e6jtmg --output RUN_ID --json
```

Inspect complete stdout, stderr, and exit status. An empty exit-0 tick is no relevant change. An exit-1 result is incomplete or failed. BB retries failed recurring scripts after 30 and 60 seconds, then pauses after the third consecutive failure. Investigate the recorded reason before any approved resume or manual run. A report is not permission to start an agent.

Schedule changes need explicit approval. Use `bb automation update AUTOMATION_ID --project proj_gjz4e6jtmg --cron 'NEW_CRON' --timezone UTC --json` only after that decision. A planned non-default record blocks automatic setup rather than silently restoring the default.

BB copies script bodies on create/update. Editing a wrapper file does not refresh the stored copy. For an approved refresh, generate and inspect the new wrapper and use a complete script replacement:

```sh
bb automation update AUTOMATION_ID --project proj_gjz4e6jtmg \
  --script-file /APPROVED_SERVER_PATH/upstream-weekly.sh --host SERVER_HOST_ID \
  --interpreter bash --timeout 120s --working-directory automation-storage --json
```

Inspect the stored body again. Changes to the checker in the same stable path apply on the next run only when its prerequisites are committed and clean. If source placement or prerequisite file names change, refresh the wrapper deliberately.

To stop checking, obtain approval and pause the owned record with `bb automation pause AUTOMATION_ID --project proj_gjz4e6jtmg --json`. Rollback means pause, preserve reports, and restore a previously reviewed local checker/source if approved. Do not delete another record, change installed providers, or advance the baseline as cleanup.

## Deliberate incorporation

Review reported provider and contract changes outside the monitored source. Obtain separate user approval to incorporate an exact revision. Compare local adaptations, preserve licensing, run compatibility and source checks, and obtain the required installed acceptance. Only then update the committed incorporated revision and watched paths deliberately. The monitor never advances `UPSTREAM.json`. Scheduling approval grants no merge, dependency update, installation, push, or PR authority.

## Source-only test seams

Credential-free tests exercise `checkUpstream` and `checkerCommand` through injected transport/clock/environment values, Git-generated owned trees, `readCommittedBaseline` and `inspectStableSource` through owned Git fixtures, and `planWeeklyCheck` through complete read-only inventory fixtures. Mutating scheduler methods are stubs and remain unused. The copied wrapper executes only an owned fake Node command. Plugin install/reload tests use the published fake host, never the real installer or scheduler.

Run `npm test -- src/upstream`, complete `npm test`, and `npm run typecheck`. Follow the repository verify skill for the non-activating build. The normal `bb plugin types ABSOLUTE_PACKAGE_PATH --check` gate must pass on the current BB 0.45.0 / SDK 0.6.15 source. See [compatibility and source-gate evidence](COMPATIBILITY.md). The provider-only exception covers only the historical BB 0.44.0 / SDK 0.5.29 diagnostic. Keep that original checker result failed, exit 1; replacement checks do not change it. Fixtures do not prove stable placement, enabled scheduling, native installed behavior, or live model acceptance.
