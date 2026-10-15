# Design

## Context

See `proposal.md` for motivation and scope.

Read-only inspection established these facts:

- BB 0.44.0's bundled Pi bridge drops `setWidget` requests in `src/bridge/extension-ui.ts`. It also presents subagent tool activity as generic tool calls rather than native background work.
- Installed `pi-subagents` 0.75.0 supplies versioned `PI_SUBAGENT_ASYNC_JSON:` status snapshots and `/subagents-inspect-rpc` replies through `PI_SUBAGENT_INSPECT_JSON:`. Inspection is session-scoped, bounded to 64 KiB, and does not require a model turn. Status snapshots carry nesting, current-tool activity, timestamps, and omission counts; they do not contain complete results.
- The public provider bridge protocol supports `backgroundTask` items and `extension.state` payloads. BB counts `local_subagent` background tasks as background-agent activity.
- The installed host daemon's idle-session cleanup explicitly skips sessions with open native background work. This is an actual retention guard, separate from a frontend row indicator. It does not turn each Pi child into a BB thread or a separately scheduled BB agent.
- Upstream `plugins/provider-pi` already ships server, host, and frontend entries. Its `PiRpcChild` has correlated RPC requests; `PiRpcSession` owns the active child. The existing injected BB extension has a bridge channel that can forward process-local lifecycle events without installing another Pi package.
- The inspected upstream checkout is `https://github.com/get-bb/bb.git` at `fdd3de3b19b97e6cd1ef7300cbb54711431249d3`. The provider path is clean. An unrelated local SDK test-fixture edit is not part of the import. Upstream uses the MIT license.
- The upstream package is not standalone unchanged. It has `workspace:*` dependencies, internal build tooling, and `@/` UI imports. This repository uses independent packages, published SDK versions, committed npm lockfiles, and a per-plugin CI matrix.

These observations establish a viable design, not a completed live proof. The parent-idle completion test remains a release gate.

## Goals / Non-Goals

**Goals:**

- Keep subagent execution, artifacts, ownership, and completion notification inside Pi.
- Put protocol validation, run reconciliation, and native event translation behind one small subagent-observation interface in the fork's bridge.
- Reuse public BB contracts for activity and storage instead of patching BB, writing its database, or simulating a main-agent turn.
- Make the fork easy to compare with its recorded upstream revision.

**Non-Goals:**

- No upstream PR, BB core patch, replacement of the bundled provider, or changes to standalone Pi configuration.
- No subagent launch, stop, steer, resume, scheduling, or model-selection controls in the new view.
- No migration of existing Pi threads, new BB child threads, or promise that BB's global child-agent concurrency limit governs Pi's children.
- No automatic upstream merge, dependency upgrade, push, PR creation, or execution of downloaded upstream code.
- No promise that work survives an explicit stop, provider disable, machine shutdown, or loss of Pi's canonical artifacts.

## Decisions

### 1. Install a second provider, not a replacement

Use package `bb-plugin-pi-subagents-provider`, provider ID `pi-subagents`, and display name "Pi with subagents". Resolve the actual plugin ID through BB's normal manifest/install rules and ensure it differs from reserved bundled IDs. Update copied provider and extension-kind references consistently.

Keep the bundled provider available and leave its threads, default selection, settings, and session files untouched. Users opt into the fork for new threads. This avoids registration collisions and makes rollback a provider selection rather than a data migration.

Alternatives rejected: registering another provider as `pi` collides with the bundled declaration; replacing the bundled plugin depends on protected identity and installation changes; a display-only companion cannot supply native work events through the provider's discarded widget path.

### 2. Import a pinned provider with a narrow local patch

Start from the committed provider tree at the recorded revision, not a copy of the developer's working tree. Preserve upstream MIT attribution and store `UPSTREAM.json` with repository URL, tracked branch, imported commit, source directory, imported Pi/SDK versions, and a reviewed list of upstream contract paths. Document identity changes, standalone packaging changes, and subagent integration in `UPSTREAM.md`.

Replace workspace dependencies with published packages. The host bridge's published SDK entrypoint must be a runtime dependency because managed installs can omit development dependencies. Replace private UI imports with SDK host modules or minimal plugin-owned vendored controls. Retain useful upstream tests and adapt their imports rather than discarding provider behavior coverage.

Set minimum BB, SDK, Pi, and subagent versions from successful checks on the declared test matrix. The inspected versions are initial evidence, not a claim of compatibility with every later version.

Alternatives rejected: fork all of BB, build against sibling upstream packages, copy uncommitted changes, or rewrite the Pi provider from scratch.

### 3. Observe structured Pi data in the provider's existing session

A bridge-owned observation module accepts session identity, structured widget/tool/lifecycle input, and disposal. It produces normalized child views and native deltas. Inject clocks and Pi RPC requests at its internal seams for deterministic tests; do not spread run maps and timers across the large upstream bridge and translator.

Use background widget snapshots for compact run trees and activity. Use foreground `subagent` tool partial/final result details for foreground children. Extend only the fork's existing injected BB extension to forward package-owned lifecycle hints and perform read-only, process-local status reconciliation when needed. Hints prompt reconciliation; snapshots and authoritative terminal receipts establish state. Never load or enable subagents merely to make the view available.

Validate kind, version, session ownership, identity lengths, depth, row counts, and encoded size. Ignore unknown fields for the supported version. Report unsupported or malformed input as unavailable; do not convert it into a successful result.

Keep native work identity stable across updates within a provider session. Correlate background descendants by their package-owned run/child IDs and foreground rows by run ID plus stable result index. Do not reuse a fleet display key as an execution ID. A session reset replaces the observation generation and invalidates pending replies.

Alternatives rejected: terminal scraping, filesystem-wide artifact discovery, raw task text as an identity, or treating a quiet child's file age as proof that it stopped.

### 4. Map authoritative background work to native BB activity

Represent top-level live async runs with native `backgroundTask` items of type `local_subagent`. Keep the child tree in the associated bounded observation state so a workflow root and every descendant are not counted as separate copies of the same work. Represent foreground child detail separately; the parent tool already keeps its foreground turn active.

Emit open/progress/terminal deltas as the execution state changes. A terminal root with live descendants remains background-active until those descendants settle. Separate execution completion from result-inspection availability. Failed inspection must not turn a successful execution into failure, or leave an actually completed run active indefinitely.

Use the lifecycle rule, not the display label alone: queued/running work and descendants that remain live require retention. Resolve paused and partial states from authoritative package state instead of assuming all paused records are live or all are stopped. Missing rows in an omitted/truncated snapshot, widget clearing, or an old timestamp do not prove completion.

Retain the main agent's normal turn boundaries. BB can have an idle main-agent turn and active background-agent work at the same time. Native work protects the Pi session from idle cleanup; it does not fabricate a continuously active foreground turn or impose BB child-thread concurrency on Pi.

On normal completion, clear native activity exactly once. On parent process loss, explicit release, or session replacement, preserve interrupted/unknown evidence and reconcile a resumed session against surviving Pi artifacts. Never resume or relaunch a child as an observation side effect.

Alternatives rejected: hold the parent turn open until all children finish, write thread status directly, keep a cosmetic running icon, or use an unbounded keepalive timer.

### 5. Capture bounded inspection data without a new control channel

The fork adds a narrow internal session method that submits only the known inspection extension command through the active `PiRpcChild`, with validated run/child IDs and request correlation. It does not use ordinary user-prompt dispatch and must confirm the command was handled without opening a model turn. Unsupported commands must not fall through into a user/model prompt.

Capture initial task detail, coalesced transcript windows while work changes, and a final output attempt when a run settles. Use one in-flight inspection per parent session, a bounded queue, timeouts, and a rate limit. Prefer terminal captures over optional transcript refreshes. Match replies by request ID and session generation; consume the emit-then-retract inspection widget without rendering it as a generic widget.

Publish normalized detail through a declared, schema-validated provider extension state. Keep a total encoded state budget of 256 KiB, a maximum 64 KiB reply, and explicit omission/truncation markers. Retain terminal detail alongside BB's thread history so browser refresh does not erase already captured results. Do not expose arbitrary filesystem paths or read arbitrary files to compensate for a stale artifact.

The frontend opens the latest captured snapshot, displays capture time and limits, and does not require an unsupported frontend-to-provider RPC method. If a result was not captured, show a specific unavailable/stale state. This gives read-only details without adding custom socket infrastructure or a full remote-control interface.

Alternatives rejected: unbounded transcript polling, copying every child message into the main conversation, calling a model for inspection, or a new server-to-live-session control transport solely for a refresh button.

### 6. Use a small native-style view

Register a Subagents thread panel for the fork. Show a compact run tree with task/label, execution state, elapsed time, and current activity. Selecting a row opens its bounded task, transcript window, and final output. Expose available result data without stop, message, launch, or resume buttons. Keep unrelated extension dialogs working through the inherited handler.

Read persisted provider observations through the public thread/event interfaces. Use BB's own background-agent indicator rather than an independently written row status. Follow `DESIGN.md` host tokens, readable wrapping, tabular counts, keyboard access, reduced motion, and explicit empty/loading/error states.

### 7. Run a weekly script check against the recorded baseline

Use BB Automations script mode. The check is deterministic and does not need a scheduled model call. Default to Monday at 09:00 UTC, `0 9 * * 1`, because the user approved weekly frequency without a day/time preference. Document that this default can be changed.

The checker reads committed `UPSTREAM.json` from the stable project source on the BB server host and compares the imported commit with upstream's tracked branch. It examines provider changes and the recorded contract-path list, including the public SDK, bridge protocol, runtime retention, and directly imported UI/build contracts. A path list is reviewable data, not a claim to detect every possible transitive change.

Use read-only repository/API requests and disposable download/cache storage outside the project source. Do not fetch into the fork's `.git`, checkout branches, change the baseline, run upstream code, merge, install, or publish. Report relevant commits and paths, baseline/head SHAs, and a review-required result in the automation run output. No-change runs produce silent success. Missing baseline, network/rate-limit failures, unavailable repositories, rewritten history, or incomplete pagination produce an explicit inconclusive/failure result, not "up to date".

Create exactly one project-scoped weekly automation only after the baseline/checker exists and its stable server-host source is available. Do not target this temporary thread/worktree. BB copies script bodies on creation, so use a stored wrapper that calls the checker in that stable source; document refresh of the automation if the wrapper changes. Repeated setup must reuse the owned record, not create duplicate schedules. Installation and plugin reload must not create schedules implicitly.

After a user-approved upstream update passes compatibility checks, update the recorded baseline deliberately. The monitor itself never advances it. Approval to schedule the check is not approval to merge its findings.

Alternatives rejected: a recurring agent task with unrestricted merge authority, a provider-install hook that creates schedules, or watching only the provider directory while ignoring its contracts.

## Risks / Trade-offs

- Background status and terminal events can race or omit children. Mitigation: idempotent reconciliation, explicit incomplete coverage, and tests for terminal roots with live descendants.
- Inspection can race a parent wake or a fast completion. Mitigation: a correlated non-model command path, session generations, bounded scheduling, and separate execution/result states.
- A copied provider creates maintenance work. Mitigation: pin provenance, keep local changes narrow, retain inherited tests, and run the weekly upstream check.
- Invalid terminal evidence can cause a stuck activity indicator or premature session release. Mitigation: never infer terminal state from silence; test cleanup and recovery, and block release acceptance if native work cannot be reconciled.
- Large results exceed the display budget. Mitigation: show bounded captured output and explicit truncation, not a false complete transcript.
- A normal provider idle test can pass before the actual cleanup deadline. Mitigation: record the configured deadline and keep a bounded live child running beyond it; report blocked if the deadline or prerequisites cannot be established.
- A local UI test is not evidence of real completion delivery. Mitigation: gate the release on installed parent-idle and completion-wake evidence.
- The weekly check depends on the server-host source and upstream access. Mitigation: fail visibly when either is unavailable and record the resolved source in setup evidence.

## Migration Plan

1. Import and package the provider under its new identities, preserving upstream attribution and recording the baseline.
2. Run inherited regression, observation, protocol/conformance, frontend, checker, type, and build checks from a standalone installation.
3. Install only the new plugin after the applicable verification approvals. Leave the bundled Pi provider and existing thread selection unchanged.
4. Run bounded live acceptance in disposable new fork-provider threads. Include a child that outlives the idle cleanup deadline, a completion wake, failure, browser reload, and session recovery.
5. Report each required check as passed, failed, or blocked. Do not release the fork as lifecycle-safe if the retention/completion gate is not passed.
6. After the fork and baseline are in the stable project source, create and inspect the single weekly automation, record its ID, and confirm it performs no repository writes.
7. Roll back by selecting the bundled provider for new work and pausing the owned automation. Do not automatically disable the fork while it owns live children or migrate/delete its existing threads.
