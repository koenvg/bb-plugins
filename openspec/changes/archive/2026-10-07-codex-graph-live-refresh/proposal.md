# Proposal

## Why

The recorded-usage graph can stay unchanged while the collector records new events. The visible graph refreshes its retained database and thread links, but only history management loads new collector events into that database.

## What Changes

- Add bounded ingestion of existing, plugin-owned collector logs to visible graph preparation. Keep the read-only calendar report separate.
- Continue preparation until the current ingestion and identity work is settled, then read the graph again. Repeat after 60 seconds while the page is visible.
- Make graph preparation time independent of quota data, so missing allowance data cannot stop graph updates.
- Keep known graph values visible during preparation. Show stopped or incomplete preparation and an explicit retry without claiming complete collection.
- Preserve explicit collector controls, import commands, original recorded values, replay safety, host checks, and cancellation. Do not start a host or server polling service.

## Capabilities

### New Capabilities

- `codex-usage-live-refresh`: Keep a visible recorded-usage graph current through bounded ingestion and preparation of existing host-local collector data, without opening history management.

### Modified Capabilities

None. The durable spec inventory has no recorded-usage refresh capability. The active `codex-usage-history` change contains broader collection and reporting requirements; this change adds the missing visible-refresh contract without duplicating those requirements or modifying that change.

## Impact

- Affected package: `bb-plugin-codex-quota`.
- Host work: report preparation, serialized history operations, and existing incremental ingestion and identity projection.
- Frontend work: calendar preparation lifecycle, its clock, progress and retry handling, and graph reload after settlement.
- Tests: public host/server interfaces, real temporary SQLite and collector logs, public SDK app lifecycle, and packaged graph checks.
- Documentation: update `docs/CALENDAR.md` to replace the current rule that all collector ingestion belongs to history management.
- No new dependency, storage schema, collector asset, account request, chart redesign, or automatic installed-plugin update is planned.
- Implementation and synthetic verification are separate from deployment. Live ingestion or installed-plugin replacement requires later explicit approval.
