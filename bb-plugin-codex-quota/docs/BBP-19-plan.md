# BBP-19 plan and test interfaces

## Fixed point

- Task BBP-19. Native blocker BBP-18 is done. Attached thread thr_edciqmh6wi and set in_progress before source work.
- Actual and expected baseline: 70f0ab2b5b7a8d7338378125a91b96a348f783b3. Initial worktree clean.
- Branch bb/bbp-19-verified-exact-thread-attribution-thr_edciqmh6wi.
- Environment env_cj5jawdign. Workspace /Users/koen/.bb/plugins/environment-git-worktree/host-data/worktrees/thr_edciqmh6wi-1/bb-plugins.
- Read approved OpenSpec proposal/design/history/reporting deltas, current package docs and BBP-18 child-result/completion-review attachments through Tasks.

## Interfaces recorded before tests

- Public server SDK: threads.list, environments.list and threads.events.list with only types [thread/identity], ascending sequence pagination, signals and explicit page limits. Plugin-owned database stores scalar discovery progress. No private BB import or transcript operation.
- Existing small HostHistory read/control interface, with an optional bounded identity evidence batch in read context. No public table CRUD methods.
- Internal attribution resolver accepts recorded workspace, Pi session ID, provider file key, untrusted captured claim and separately confirmed import relationships. Provider identity is never compared to Pi session ID.
- Real temporary SQLite tests exercise immutable captured ownership, durable evidence, bounded projection, replay exclusions and unchanged reads. Injected SDK and filesystem functions use synthetic metadata only.
- HistoryReadinessPanel receives bounded exact-thread totals and a navigation callback. The app supplies public useBbNavigate().toThread. UI tests verify links, stable labels and selection guards.

## UI layout

Keep quota, activity, workspace totals and collector controls in their existing places. Add a compact exact-thread list after workspace totals. Show attribution grades and discovery/backlog limits next to it. Long titles and IDs wrap. At 375px, use stacked rows with a full-width reachable navigation button. Inspect synthetic desktop/375px screenshots early, before the full UI matrix.

## Boundaries and checks

No live install, restart, source switch, settings change, transcript read/import or billed turn. No retention/pruning/recovery work. Preserve durable replay owners and indexed workspace totals. Keep captured payloads unchanged. Store identity links separately. SDK pin and lockfile stay unchanged.

Run red/green focused tests, full tests, typecheck, SDK compatibility --check, complete synthetic bundle checks, Node 22 packaged checks, strict OpenSpec and build in order. Run exactly one fresh read-only completion review against the recorded baseline, including untracked task files. Resolve blockers and rerun affected checks. Commit only this slice and retain a clean worktree.
