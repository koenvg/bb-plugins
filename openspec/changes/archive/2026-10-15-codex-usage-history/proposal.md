# Proposal

## Why

BB's Codex plugin shows current account allowance but cannot explain which work consumed tokens or estimated monetary value over time. OpenForge's Codex Usage plugin already implements much of this, and BB's thread identity events plus host-scoped workspace paths provide a practical attribution route without a new session-ID API.

## What Changes

- Extend `bb-plugin-codex-quota` without replacing its plugin ID, dashboard route, footer battery, host selection, or quota refresh behavior.
- Port compact Pi usage collection, incremental local indexing, explicit historical import, coverage diagnostics, retention, and storage recovery from the OpenForge plugin, adapting its Task and Project assumptions to BB.
- Resolve exact BB thread attribution from all available `thread/identity` events and captured BB thread context. Use host plus normalized workspace path for workspace attribution when exact identity is missing. Never split a shared workspace total across threads or count it once per thread.
- Add 30-day local-calendar reports, compatible prior-period comparisons, token-class breakdowns, captured estimated-cost totals, and bounded workspace/thread rankings. Make workspace reporting the default so missing thread links do not hide usable records.
- Add independently refreshed account-wide activity from Codex's profile endpoint, clearly separated from host-local collected history.
- Preserve unknown pricing, incomplete collection, ambiguous identity, stale results, and expired history as visible limitations. Dollar values are captured usage estimates, not subscription spending or measured quota debits.
- Replace the existing spec's blanket prohibition on collectors and transcript inspection with an explicit separation: quota reads remain history-free; collection is user-installed and historical transcript import is user-started.
- Defer proportional weekly-allowance allocation, completed-work/productivity metrics, automatic historical scans, reset redemption, and non-Pi provider collectors.

## Capabilities

### New Capabilities

- `codex-usage-history`: Selected-host collector controls, bounded ingestion/import, exact-thread and workspace fallback attribution, replay safety, coverage, retention, privacy, and recovery.
- `codex-usage-reporting`: Calendar-period reports and rankings for recorded tokens and captured estimated cost, with honest missing-data and attribution labels.
- `codex-account-activity`: Normalized account-wide token activity with independent freshness, authentication guards, and failure isolation.

### Modified Capabilities

- `codex-quota`: Permit the separate opt-in history subsystem while keeping quota acquisition free of transcript reads, collector requirements, and historical side effects. Preserve allowance semantics and existing privacy/freshness guards.

## Impact

- Backend/host: extend `server.ts`, `host.ts`, and strict RPC contracts; introduce focused history, attribution, storage, and activity modules plus a packaged Pi collector asset.
- Frontend: adapt the source plugin's Svelte reports to React in the existing BB dashboard, with separate history request state and collector/import controls. Keep existing footer and countdown contracts intact.
- Dependencies/build: validate persistent SQLite support in the actual BB host runtime and collector asset installation from the self-contained bundle before relying on either. No BB core or SDK change is required for the proposed attribution strategy.
- Source reference: `/Users/koen/workspace/openforge-plugins/plugins/codex-usage`. Reuse domain logic and relevant tests after checking package licensing; do not modify or depend on that checkout at runtime.
- Storage: plugin-owned files on the selected host, separate from BB core data and OpenForge collector/database locations. Existing quota-only installations continue working without collector installation or historical import.
