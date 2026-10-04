# BBP-22 implementation boundary

Baseline: f795a08c12e1754f9ba9e387c1c50c3c599169af. Clean worktree. Native blockers BBP-18/19 are done. Parent clarification in thr_2k7buag9sh authorizes explicit plugin-owned per-host root configuration, not automatic core-root discovery. No real root configuration or transcript scan is authorized during development.

## Public test seams, recorded before tests

- HostHistory keeps read/control and adds one import operation accepting a strict discriminated command: status, configure, start, resume, cancel. No public table/file/maintenance API.
- Browser inputs carry selection and bounded configuration only. Server supplies known workspace paths from public environments on that host. Provider candidates come from completed existing verified identity evidence. Browser cannot supply identity evidence or filenames.
- Internal importer dependencies accept clock, byte/row budgets and read observation for synthetic tests. Persistent tests use node:sqlite and owned UTF-8 files, not SQL mocks.
- Configuration validation resolves directories on the owning host. A generation freezes resolved roots, directory identities, workspace evidence, retained UTC range and candidates. Configuration cannot retarget an unfinished generation.
- A command executes one bounded cycle under request/lifecycle cancellation and a worker lease. Reload/status never runs work. Resume is explicit. No import timer or background quota owner.
- Canonical projectCompactRecord and usage_entry_owners remain authoritative. Imported usage has a stable scalar identity. Confirmation and replay aliases do not replace original ownership. Copied ancestry needs verified confined parent and shared entry-chain evidence. Unresolved overlap/ancestry stays excluded with fixed diagnostics.

## Layout before implementation

Add an initially collapsed Historical import section beneath collection controls. Show configured-source warning, root fields and explicit Save sources. Progress shows frozen UTC range, selected-host/workspace scope, candidates/bytes/records/omissions and fixed diagnostics. Start, Check import status, Resume and Cancel are separate native buttons. At 375px labels/fields stack, paths wrap and buttons wrap. Quota host controls and official link remain above history. Inspect early synthetic desktop/375px images before the full matrix.

## Verification

Test first: missing configuration and status without source reads; persistent frozen generation and explicit resume. Then branching/copies/live overlap/privacy, path/host/prefix/symlink collisions, malformed/oversize/replaced files, interruption and lease/disposal; UI queued dispatch and selection revision. Run focused/full tests, typecheck, SDK --check before bundle builds, full bundle suite, actual packaged import fixtures on Node 22/24, strict OpenSpec and final build. One fresh-context read-only completion review covers complete baseline diff and all untracked task files. Resolve its findings and rerun affected checks; no second review.
