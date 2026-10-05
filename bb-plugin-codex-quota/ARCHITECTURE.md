# Codex Quota architecture

The BB entries register behavior. The modules behind them own the state and ordering rules.

## Selected host

`selected-host.ts` owns selection generations, enrollment checks, connected-host checks, active requests, cancellation, and response validation. Its interface is `selection`, `select`, `request`, and `dispose`.

Every selected-host RPC uses the same request guard. It checks the host before dispatch and again before publication. Selection changes and disposal settle callers even if an external adapter ignores cancellation. Feed-specific unavailable results and error classifications remain explicit. Import preparation checks cancellation between metadata pages and before dispatch.

## Account

`account.ts` owns quota and activity reads, account checks, independent caches, deadlines, and disposal. Its interface is `quota`, `activity`, and `dispose`. A failure in one feed does not clear the other feed's cache.

`pi-auth.ts` is the Pi adapter. It resolves existing Codex OAuth credentials, registers the static OAuth loader needed by the bundled host, and maps errors to fixed diagnostics. Tokens and account fingerprints stay inside the host worker. It does not sign in, configure collection, or import history.

## History

`history-host.ts` owns one database-operation queue and the import cancellation epochs. Its interface is `read`, `report`, `control`, `controlImport`, and `dispose`.

- `report` is explicitly read-only. It returns a calendar report directly, not a fake readiness result containing a calendar field.
- `history-maintenance.ts` owns mutable readiness, collector control, reconciliation, retention, identity maintenance, and recovery.
- Import keeps its existing explicit command protocol and storage implementation.
- Canceling a request can release its caller without releasing the database queue. The next operation cannot enter storage until the previous operation actually settles.
- Imports must also finish database cleanup before the host entry releases their retained-worker lease.

The storage schema, collector asset, import format, prices, attribution rules, and UI remain unchanged.

## Tests

The main seams are server RPC, host RPC, and the history module's interface. Tests cover host/account switches, unavailable hosts, malformed results, cancellation, disposal, serialized storage work, and worker leases. Packaged checks use temporary SQLite files and synthetic credentials. They do not prove live collection or billed charges.

New and changed request/lifetime tests are included in the TypeScript check. Other historical gaps remain tracked in BBP-93. Shared selected-host guard work corresponds to BBP-94. Footer work remains separate in BBP-61.

## Local deployment

Build and test against the current BB SDK before installation. Install a complete, self-contained package snapshot under a durable directory such as `~/.bb/local-plugin-sources/codex-quota/`, with its dependencies and built artifacts. Do not point an installed plugin at a disposable thread worktree or symlink its dependencies there.

Use `bb plugin install <durable-directory> --yes` to move an existing local-path installation. This preserves BB plugin settings. Do not uninstall to change directories. Keep the previous working snapshot for rollback and confirm the installed source and status with `bb plugin source codex-quota --json` and `bb plugin list --json`.

Reload resets the server-memory host selection. It does not pause or remove an independently installed Pi collector, change its stored control state, or resume historical imports.
