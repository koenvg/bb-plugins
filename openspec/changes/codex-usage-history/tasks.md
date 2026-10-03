# Tasks

## 1. Prove host compatibility and define public interfaces

- [ ] 1.1 Record the pre-implementation commit and working-tree state, check the public SDK with `bb plugin types <package-path> --check`, and identify the history/activity interfaces and fixture matrix; verify the baseline and test seams are documented before code mutation and preserve MIT notices for ported source.
- [ ] 1.2 Add the host-local SQLite adapter and missing-capability result, test-first with a real temporary database; verify the self-contained host bundle creates, transacts, reopens, and queries persistent data and the unavailable path leaves quota callable.
- [ ] 1.3 Package a self-contained BB-specific Pi collector asset and prove its install/loading path in an isolated temporary Pi configuration; verify the built asset does not depend on the OpenForge checkout, overwrite existing extensions, or access real credentials/network.
- [ ] 1.4 Add strict bounded history/activity RPC contracts and selected-host/generation routing; verify SDK harness tests cover offline/foreign hosts, invalid inputs, cancellation, host-switch races, and bounded JSON results.

## 2. Capture compact usage and control the collector

- [ ] 2.1 Adapt the versioned usage-event parser and collector for `openai-codex` message-end capture, actual cwd, Pi session ID, bounded provider-session file key, optional BB thread claim, token classes, and captured cost/missing-price state; verify event fixtures exclude all message/tool content, authentication data, and non-Codex messages.
- [ ] 2.2 Port bounded live-entry confirmation and serialized per-process writes; verify tests cover multiple messages, shutdown draining, interrupted confirmation, unique event identities, and fixed content-free errors without lost or duplicate capture.
- [ ] 2.3 Implement collector status/install/repair/pause/resume against plugin-owned host storage with atomic extension replacement and durable coverage/control metadata; verify repair preserves the first boundary/events, pauses stop new capture, resume preserves gaps, and other Pi extensions remain untouched.
- [ ] 2.4 Document collector scope, resolved storage paths, restart requirements, and independent Pi-extension lifecycle in the plugin README and relevant plugin-owned skill documentation; verify documentation matches the installed asset/configuration and does not claim BB disable stops an offline host's writer.

## 3. Resolve exact identities and workspace fallback

- [ ] 3.1 Add bounded public SDK discovery of Pi thread/environment metadata and all retained `thread/identity` bindings, including archived threads; verify tests page identity changes without reading prompt/message events or using private BB imports.
- [ ] 3.2 Correlate collected provider-session keys and confirmed imported headers with BB identities, keeping provider identity distinct from Pi session ID; verify fixtures cover the observed filename/header difference, multiple identities per thread, malformed claims, missing evidence, and conflicting bindings.
- [ ] 3.3 Add host-scoped normalized workspace keys and original-ownership persistence; verify tests cover shared workspaces, symlink aliases where resolvable, removed paths, path-prefix collisions, same paths on different hosts, and thread moves without guessed per-thread allocation.
- [ ] 3.4 Document exact-thread, workspace-only, ambiguous, and unattributed grades plus their exclusion rules; verify fixture-backed examples show a shared workspace once and exclude it from exact-thread totals.

## 4. Index collector logs and retain reconstructible history

- [ ] 4.1 Add transactional history/coverage/source-progress schemas and incremental collector ingestion; verify real-database tests cover unchanged-source zero body reads, append/truncation/replacement, malformed records, bounded batches, backlog diagnostics, and replay after reload.
- [ ] 4.2 Add compact UTC token/captured-cost projections and replay-alias evidence atomically with ingestion; verify detailed-row expiry leaves retained local-day totals reconstructible and original prices unchanged.
- [ ] 4.3 Implement bounded pruning/backfill and storage-health recovery; verify 45-day detail retention, the three-month compact horizon plus support/timezone margins, no expired replay resurrection, corruption quarantine/rebuild gaps, and untouched newer schemas.
- [ ] 4.4 Define scope-aware observed/imported/uncovered intervals and writer/pause/omission uncertainty; verify tests distinguish observed inactivity from unknown dates and do not certify existing sessions from installation time alone, then document retention and non-destructive recovery.

## 5. Import historical transcripts only on request

- [ ] 5.1 Add confined paginated BB Pi session discovery and an opt-in ordinary-Pi discovery adapter for known workspace scopes; verify custom BB session roots, bounded header reads, path traversal/symlink confinement, absent paths, and that ordinary startup/report/quota operations invoke neither adapter.
- [ ] 5.2 Port bounded UTF-8 ranged parsing and durable import generations with frozen retained ranges, source identity checks, explicit start/status/resume/cancel, and one unfinished generation per host; verify interruption, oversized lines, source replacement, cancellation, and reload require no persisted partial message text or automatic resume.
- [ ] 5.3 Resolve live/import overlap and copied fork ancestry with shared usage/entry evidence; verify replay and branched-session fixtures charge confirmed messages once while quarantining uncertain duplicates rather than using timestamp/token/cost equality as proof.
- [ ] 5.4 Wire bounded import execution to host worker lifecycle/leases and selected-host cancellation; verify every terminal/abort path releases owned resources and old-host results stay hidden, then document import limits, omissions, resume/cancel, and explicit consent to read retained transcripts.

## 6. Add isolated account-wide activity

- [ ] 6.1 Adapt bounded profile-endpoint reads and activity normalization through the existing host Pi auth runtime; verify supported summary/activity fields, independently unknown missing fields, oversized/malformed responses, fixed errors, and zero credential/raw-body leakage.
- [ ] 6.2 Add an independent coalesced activity cache with host/account rechecks and five-minute freshness/24-hour expiry; verify identity changes, stale retention, clock-only expiry, and activity failure never invalidate quota/history or start transcript discovery.
- [ ] 6.3 Document account-wide versus selected-host historical usage and the lack of account proof for old records; verify UI contract fixtures retain local history without sign-in and never combine account activity with collected token/cost totals.

## 7. Build calendar reports and the React dashboard

- [ ] 7.1 Port local-calendar range logic and bounded workspace/exact-thread aggregation; verify real-index query tests cover a 30-day range ending yesterday, previous/next limits, IANA timezones, daylight-saving transitions, and consistent scope across summaries/rankings/daily detail.
- [ ] 7.2 Add daily metric selection, active-entity denominators, token-class detail, priced-subset cost totals, and compatible prior-period comparisons; verify fixtures cover overlapping reasoning/output classes, zero/missing prices, partial dates, detail expiry, no eligible prices, and zero prior baselines without repricing or invented zeros.
- [ ] 7.3 Add bounded token-ranked entity rows with ten initially visible, up to fifty, disclosed truncation, verified thread links, and archived/deleted fallback labels; verify report totals include records beyond visible rows without duplicating workspace-only usage into thread rankings.
- [ ] 7.4 Add independent host/generation/range-keyed history and activity request state while retaining the existing quota refresh owner; verify late responses, overlapping requests, focus/resume, visibility, watch/timer disposal, and no account calls or imports on history navigation.
- [ ] 7.5 Compose the existing quota dashboard with the workspace-first chart, exact-thread toggle, accessible daily detail, collapsed account activity, and collection/import controls; verify React/SDK slot tests cover loading/empty/partial/stale/unavailable states and actions occur only on explicit activation.
- [ ] 7.6 Inspect an early representative desktop and 375px preview before completing layout tests; verify readable controls/rankings, keyboard chart-value access, local table scrolling, retained host/quota/official-link access, and no second footer or quota polling owner.
- [ ] 7.7 Update dashboard examples, metric/denominator definitions, pricing caveats, and troubleshooting in the README/plugin-owned documentation; verify each documented action and state against report fixtures and preserve existing footer/countdown instructions.

## 8. Verify the complete installed change

- [ ] 8.1 Run the complete affected package suite, `npm run typecheck`, `bb plugin types <package-path> --check`, `npm run test:bundle`, and `bb plugin build <package-path>` in prerequisite order; verify all exit successfully and existing quota/cache/footer/countdown/lifecycle/privacy regression tests still pass.
- [ ] 8.2 Follow the repository verification workflow for this exact checkout, obtaining required source-switch, installation, collector, restart, or live-turn approvals before those actions; verify real selected-host quota with Provider usage disabled, actual permitted collector capture/import, workspace fallback and exact linkage, account-activity failure isolation, responsive/keyboard behavior, and reload/disposal with an evidence report that distinguishes synthetic checks from live observations and missing-price limits.
- [ ] 8.3 Run the single fresh-context read-only completion review against the recorded baseline including untracked task files, resolve blocking findings, and rerun checks affected by fixes; verify the review result and validation evidence before declaring implementation complete.
- [ ] 8.4 Report final installed source/enabled state, collector state, approved cleanup, retained data, and rollback instructions; verify no unintended source/configuration changes, unrelated storage deletion, orphaned leases/watches/timers, or undisclosed acceptance gaps remain.
