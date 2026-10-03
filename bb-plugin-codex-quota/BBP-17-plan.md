# BBP-17 implementation boundary

Baseline: `6c6bd792926de897215898e01b1e09c14ddba252`. Initial worktree clean.
Branch: `bb/bbp-17-selected-host-history-readiness-thr_jtg8e33kif`.
Environment: `env_trhyid5wv6`. Thread: `thr_jtg8e33kif`.
Native task blockers: none. Public SDK: 0.5.29, check passed before changes.

## Layout

Keep the existing quota dashboard, host selection, refresh, reset countdowns and official link unchanged. Add one history readiness section after quota and other limits. Show readiness without opening management. Put lifecycle and privacy notes in a native disclosure. Wrap controls at 375px. No installation/import button in this slice. BBP-18 owns live collection and controls.

Early desktop and 375px screenshots are synthetic layout checks, not installed acceptance.

## Test seams fixed before tests

- One host-history object with `read(context)` for bounded readiness. Later slices add the approved collector/import controls to this object, not methods per table.
- `createHostHistory` accepts capability/collector checks for unavailable fixtures. Production uses the runtime adapter and plugin-owned host paths. No auth input, server storage, transcript discovery or network dependency.
- `openHistoryDatabase` is an internal SQLite adapter. It supports exec, prepared statements, transactions and close. The host bundle retains its named export for a packaged persistence test only; it is not an RPC method. Test uses a real temporary file and the Node SQLite adapter, then exercises the packaged history handler against that file. No mocked SQL.
- Strict readiness schemas define fixed storage, collector and routing diagnostics. Selected host/generation guards use the existing server selection owner and cancel active readiness reads on changes/disposal.
- A separate React readiness component keys reads by selected host/generation and browser selection-transition revision and rejects late results. It has no polling timer and does not own quota refresh.
- Packaged collector compatibility asset registers in Pi through its public loader. It fails closed without explicit compatible control metadata. The compatibility fixture checks its real message and shutdown handlers, not an empty extension. The temporary installation fixture uses serialized absolute host paths and preserves unrelated extensions/settings. It does not claim live capture or loaded writers from file existence.

## Fixture matrix

Missing/incompatible storage, missing/incompatible collector, unconfigured/unsupported schema, canceled/lifecycle-aborted read, foreign/offline host, malformed/oversized input, selection generation races, privacy rejection, quota/footer/countdown/link regressions, isolated Pi discovery/loading, persistent create/transaction rollback/reopen/query through the host bundle.

## Source and licensing

Read only source files and package metadata in `/Users/koen/workspace/openforge-plugins/plugins/codex-usage`. Its package declares MIT; inspected source files have no copyright header. This readiness slice uses new code, not copied source algorithms. No OpenForge history or real transcript bodies were read. Any later copied module must carry its applicable MIT notice.

## Integration

BBP-24 owns account activity. Shared-file edits here are additive imports, one history contract/handler, one server route and one dashboard child. The review fix adds selectionPending/selectionRevision fields to selection-store.ts, so all selected-host views can invalidate as soon as a switch starts, independently from quota/auth completion. Do not merge by replacing complete shared files. No activity auth/cache behavior changes. OpenSpec epic checkboxes stay unchanged because this slice cannot establish epic completion.
