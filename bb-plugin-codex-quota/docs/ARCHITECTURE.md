# Codex Quota architecture

The BB entries register behavior. The modules behind them own the state and ordering rules.

## Directory layout

```text
src/
  plugin/       BB registration adapters and entry tests
  account/      Authentication, endpoint reads, and account lifetime
  selection/    Shared selected-host state and request guards
  quota/        Quota contracts, normalization, cache, and views
  activity/     Activity contracts, normalization, cache, and views
  footer/       Footer integration and DOM adapter
  history/
    storage/    Database layout, ingestion, projection, recovery, retention
    collection/ Collector assets, controls, logs, coverage, usage evidence
    import/     Import contracts, sources, parsing, queue, and views
    identity/   Identity catalog, discovery, resolution, storage, and views
    calendar/   Read-only reports, aggregation, money, chart, and views
```

Tests and test helpers stay with their modules. The history coordinator and shared history interface stay in `src/history/`. The folders follow ownership, not file types. They add no wrapper modules or barrel exports.

The manifest points directly to `src/plugin/app.tsx`, `src/plugin/server.ts`, and `src/plugin/host.ts`. Built entry artifacts remain `dist/app.js`, `dist/server.js`, and `dist/host.js`. Scripts and immutable fixtures stay at package level. Design and validation notes live in `docs/`; the README, plugin overview, configuration, and license notices stay at the package root.

## Selected host

`src/selection/selected-host.ts` owns selection generations, enrollment checks, connected-host checks, active requests, cancellation, and response validation. Its interface is `selection`, `select`, `request`, and `dispose`.

Every selected-host RPC uses the same request guard. It checks the host before dispatch and again before publication. Selection changes and disposal settle callers even if an external adapter ignores cancellation. Feed-specific unavailable results and error classifications remain explicit. Import preparation checks cancellation between metadata pages and before dispatch.

## Account

`src/account/account.ts` owns quota and activity reads, account checks, independent caches, deadlines, and disposal. Its interface is `quota`, `activity`, and `dispose`. A failure in one feed does not clear the other feed's cache.

`src/account/pi-auth.ts` is the Pi adapter. It resolves existing Codex OAuth credentials, registers the static OAuth loader needed by the bundled host, and maps errors to fixed diagnostics. Tokens and account fingerprints stay inside the host worker. It does not sign in, configure collection, or import history.

## History

`src/history/history-host.ts` owns one database-operation queue and the import cancellation epochs. Its interface is `read`, `report`, `prepare`, `control`, `controlImport`, and `dispose`.

- `report` is explicitly read-only. It returns a calendar report directly, not a fake readiness result containing a calendar field.
- `prepare` loads bounded existing collector logs, accepts identity evidence and reconciles identity. Ingestion and identity backlog both prevent settlement. It does not call mutable readiness or change collector controls, assets, imports, retention, or recovery.
- Collector discovery keeps its next unchecked UTC date in the reserved `@collector-discovery-v1` row of `collector_sources`. The `stamp` field holds the date; all numeric fields are zero, so this metadata row does not count as source backlog or invalid records. It is never opened as a file. This adds durable progress without a schema migration. Per-file offsets commit with projections before discovery can advance. Cancellation or failure leaves the current date slice replayable. `collector_log_retention` remains the independent management-only pruning cursor.
- `src/history/storage/retained-history.ts` checks existing storage and control before report or preparation work. It closes each connection only after its synchronous or asynchronous callback finishes.
- `src/history/history-maintenance.ts` owns mutable readiness, collector control, reconciliation, retention, identity maintenance, and recovery.
- Import keeps its existing explicit command protocol and storage implementation.
- Canceling a request can release its caller without releasing the database queue. The next operation cannot enter storage until the previous operation actually settles.
- Imports must also finish database cleanup before the host entry releases their retained-worker lease.

The storage schema, collector asset, import format, prices, attribution rules, and UI remain unchanged.

## Tests

The main seams are server RPC, host RPC, and the history module's interface. Tests cover host/account switches, unavailable hosts, malformed results, cancellation, disposal, serialized storage work, and worker leases. Packaged checks use temporary SQLite files and synthetic credentials. They do not prove live collection or billed charges.

`src/selection/selected-host.test.ts` runs the same public RPC guard matrix for quota, activity, readiness, collector controls, calendar reports, and import status. It checks malformed input and output, foreign hosts, enrollment loss, and offline hosts before dispatch and before publication. It also holds each request stage while switching, clearing or restoring selection, or disposing the server. Callers must settle before the held adapter returns, with the feed's own unavailable result.

New and changed request/lifetime tests are included in the TypeScript check. Other historical gaps remain tracked in BBP-93. The shared selected-host guard and its cross-feed checks cover BBP-94. Footer work remains separate in BBP-61.

## Explicit storage upgrade

Retained graph preparation rejects older schema-4 indexes without `identity_uncertain` before it writes data. A separate offline command can upgrade only that known layout, with a private backup and explicit apply. It does not change collector settings or ingest logs. See [STORAGE_UPGRADE.md](STORAGE_UPGRADE.md) for the procedure and limits.

## Local deployment

Build and test against the current BB SDK before installation. Install a complete, self-contained package snapshot under a durable directory such as `~/.bb/local-plugin-sources/codex-quota/`, with its dependencies and built artifacts. Do not point an installed plugin at a disposable thread worktree or symlink its dependencies there.

Use `bb plugin install <durable-directory> --yes` to move an existing local-path installation. This preserves BB plugin settings. Do not uninstall to change directories. Keep the previous working snapshot for rollback and confirm the installed source and status with `bb plugin source codex-quota --json` and `bb plugin list --json`.

Reload resets the server-memory host selection. It does not pause or remove an independently installed Pi collector, change its stored control state, or resume historical imports.
