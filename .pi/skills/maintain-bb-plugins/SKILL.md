---
name: maintain-bb-plugins
description: Maintain approved BB plugins from /Users/koen/workspace/bb-plugins and the approved local Pi collector. Use for daily plugin updates or an explicit request to run this maintenance workflow, not for editing plugin code or this skill.
compatibility: BB CLI, Git, and installed Bun on Koen's approved local checkout host.
---

# Maintain BB plugins

Update the BB plugins from /Users/koen/workspace/bb-plugins. This is a daily maintenance
automation approved by Koen.

## Scope and safety
- Work in the existing checkout, not a worktree. Inspect git status and branch first. Only
  proceed on main with a completely clean working tree. If there are local changes, another Git
  operation, or a different branch, stop and report the blocker. Never stash, reset, discard,
  commit, or push changes.
- Pull origin main using git pull --ff-only. Stop if the pull fails or cannot fast-forward.
- Discover plugin directories by reading their package.json manifests with a bb plugin
  declaration. Inspect bb plugin list --json to determine installed sources.
- The approved plugins are code-cleanup, codex-quota, github-insight, pr-thread-list, and
  tasks-plus. Also maintain any additional plugin already installed from this exact checkout,
  since its installation has already been approved.
- Permanently exclude liquid-glass / bb-plugin-liquid-glass. Never build, install, or enable it,
  even if its source returns or its compatibility changes.
- For any other newly discovered plugin not already installed from this checkout, report its
  name, description, directory, and compatibility requirements, and ask Koen explicitly whether
  to build and install it. The shared root workspace dependency installation described below is
  approved and does not grant approval to build, install, or enable that plugin. Before explicit
  approval, do not run plugin-specific dependency installation, build, or plugin installation
  for that plugin. Silence is not approval. A new plugin must not prevent maintenance of
  approved plugins. If Koen approves in this run's thread, build and install only the approved
  candidates and verify them.

## Maintenance
- After the successful pull, run `bun --no-install run sdk:audit --all-worktrees` from the
  approved checkout before dependency setup, builds, or installation. Retain its JSON and exit
  status. Follow [SDK audit guidance](../../../README.md#audit-and-align-the-host-sdk).
  Interpret each official diagnostic under the exception below, not from its exit code alone.
  Other thread worktrees are report-only. Do not run SDK alignment in this automation.
- Host-version policy approved by Koen: a newer BB host or host SDK version alone must not stop
  this maintenance automation. An exact difference between a plugin's committed SDK pin and the
  host SDK is not proof of runtime incompatibility. Do not require bb plugin types --check to
  pass as a prerequisite to the builds and installations below. Treat an audit diagnostic
  that only requests SDK pin synchronization as advisory. For this
  automation only, this rule overrides the exact-pin synchronization gate in the repository's
  verification workflow. It does not waive any other diagnostic or actual incompatibility.
- Keep the committed dependency pins and declared engines.bb and engines.bbPluginSdk constraints
  unchanged. Use the installed BB CLI's build, install, and activation validation to enforce
  supported compatibility. Never bypass a declared compatibility range, SDK/API incompatibility,
  failed build, failed install, or failed activation. A genuine plugin-specific blocker must be
  reported for that plugin; continue maintenance of other independent approved plugins when
  their prerequisites still hold. Shared dependency failure, unsafe Git state, and unexpected
  tracked changes retain their stop rules. Never run a rewriting SDK synchronization command or
  migration to make maintenance pass.
- This checkout uses Bun workspaces with one committed root bun.lock. After the clean-main check
  and successful pull, run NODE_ENV=development bun install --frozen-lockfile once from
  /Users/koen/workspace/bb-plugins, using the installed Bun version and including
  devDependencies. Shared dependency resolution and installation for all workspace packages is
  approved, including packages whose plugins are not approved for build or installation. Missing
  per-plugin lockfiles are expected and are not a blocker. Do not require or create per-plugin
  lockfiles. If Bun is unavailable or frozen workspace dependency installation fails, report the
  blocker without creating or changing lockfiles or falling back to npm. A failed workspace
  dependency install blocks all dependent builds and plugin installations.
- After workspace dependency installation succeeds, process each approved plugin that exists
  sequentially. Run bb plugin build in its directory, then bb plugin install
  path:<absolute-plugin-directory> --yes --json only if its build succeeded. Capture full logs
  and summarize failures. Never install a plugin whose workspace dependency installation or
  build failed.
- Preserve settings, secrets, schedules, and the enabled/disabled preferences of existing
  plugins. If a path install enables a previously disabled plugin, restore its disabled state.
  Never remove an existing plugin to bypass a source conflict; report it and ask first. Do not
  change manifests, dependency pins, runtime configuration, or compatibility constraints to fix
  a failed build or install.
- Verify final state using bb plugin list --json. Verify installed approved plugins use this
  checkout and report running, disabled, incompatible, or failed status accurately. Ensure
  excluded plugins remain uninstalled. Do not mention excluded plugins in reports, status
  updates, or approval questions. Inspect git status after all commands and report any
  unexpected tracked changes without discarding them.

## Collector maintenance
- Run this section only after the shared root workspace dependency installation and the approved
  codex-quota build and plugin installation succeed in this run. Otherwise report collector
  maintenance as skipped. Preserve the plugin's enabled/disabled preference. If its public RPC
  is unavailable, report a blocker rather than enable it to run this section.
- The only approved machine is the local checkout host host_dt6w76k4w8, Koen MacBook Air. The Pi
  collector is shared per machine, not per project. Maintain it once for this host. Leave other
  machines untouched and report any known machines needing maintenance as awaiting operator
  approval. This approval does not enroll remote machines.
- Use only the public CLI for collector and selection operations: bb plugin rpc call codex-quota
  <method> --input-file <temporary-JSON-file> --json. Put the exact method input in a temporary
  JSON file and capture the response. selection takes JSON null and returns {hostId,generation}.
  selectHost takes {hostId:string|null} and returns {hostId,generation}. historyReadiness takes
  {hostId,generation}. The only allowed collectorControl input is
  {hostId,generation,action:"repair"}. Read bb-plugin-codex-quota/src/plugin/server.ts and
  src/history/history-contract.ts under that plugin before these calls. If the installed
  contract cannot support these inputs or states, stop this section and report the blocker.
  Never substitute direct collector file copies, credential edits, or database writes.
- Before changing selection, call selection and save the exact original {hostId,generation} as
  savedSelection. If hostId is already host_dt6w76k4w8, use that pair as maintenanceSelection
  without calling selectHost. If another host is selected, report a blocker and leave selection
  untouched. Only if savedSelection.hostId is null may you select the approved host. Re-read
  selection immediately before that call and require both fields to equal savedSelection. Call
  selectHost with {hostId:"host_dt6w76k4w8"} once. Require the returned hostId to match and
  retain its returned generation as maintenanceSelection. Re-read selection and require an exact
  match before proceeding. An unexpected response or observed selection change stops this
  section. Do not retry, chase a selection, or reselect.
- Before and after each readiness or repair call, read selection and require both hostId and
  generation to equal maintenanceSelection. Use that exact pair for all historyReadiness and
  collectorControl inputs. Any mismatch or selection-changed response stops collector work and
  must be reported. Treat no-selection, foreign-host, host-offline, unsupported, and RPC errors
  as report-only blockers, not reasons to change selection again.
- Call historyReadiness and save its response. An asset with collector="compatible-v1" is a
  no-op. Report any storage or readiness blocker separately. Repair is allowed only when
  state="unavailable", reason="collector-incompatible", storage="compatible",
  collector="incompatible", and collection metadata is present. Save collection.enabled,
  collection.firstObservedAt, and collection.pauseCount as captureState before repair.
  collector="missing", absent collection metadata, state="not-configured", or
  storage="unconfigured", "unavailable", "incompatible", or "unchecked" are report-only
  blockers. Any other readiness state or reason, including retirement-incomplete, is also
  report-only.
- For that eligible existing incompatible collector only, call collectorControl once with
  maintenanceSelection and action="repair". Preserve paused capture, firstObservedAt,
  pauseCount, and existing history. Never install a missing collector, prepare or retire legacy
  data, resume or pause capture, run imports, edit credentials, or restart or stop sessions. On
  a failed or uncertain repair, report the result without retrying or taking corrective actions
  outside this section.
- After repair, inspect the collectorControl response and call historyReadiness again through
  the public CLI while selection still matches. Require state="available", reason="ok",
  collector="compatible-v1", storage="compatible", and collection metadata with enabled,
  firstObservedAt, and pauseCount exactly equal to captureState in both responses. Otherwise
  report verification failure and leave capture and history untouched. These checks verify asset
  compatibility and capture metadata, not a complete audit of stored history. Record writer
  status without treating writer="observed" as proof that every session loaded the new writer or
  that future response-tier coverage is complete.
- Finally, including on a blocker or failed repair, restore the original host only if this run
  changed a prior null selection and no selection change was observed. Immediately before
  restoration, call selection and require the current hostId AND generation to match
  maintenanceSelection exactly. Only then call selectHost with {hostId:null} once and verify its
  returned selection with a fresh selection read. If the check fails or selection cannot be
  read, leave it untouched and report that restoration was skipped. If this run did not change
  selection, do not restore it. selectHost has no expected-generation input, so these
  read-then-write checks are not atomic. A concurrent user change between the final check and a
  selectHost call can still be overwritten. Report this limitation; do not claim guaranteed
  protection against that race.
- Include the collector result in the final report alongside the existing plugin results. State
  skipped, compatible no-op, repaired and verified, or blocked/verification failed. Include the
  approved host, readiness state/reason, storage and collector states, capture-state
  preservation checks when repaired, selection/restoration outcome, and any other machines
  awaiting operator approval. After repair, report that existing sessions require an operator
  restart to load the updated writer. Do not restart them. Asset compatibility alone does not
  prove all sessions loaded the new writer or guarantee future response-tier coverage.

- Finish with a concise report of the pulled commit, build/install outcomes, blockers, and any
  newly discovered plugins awaiting approval. Do not claim functional UI testing was performed.
  Do not create or modify other automations.
