# codex-quota-background-refresh Specification

## Purpose

Keep the selected host's Codex quota updated while BB is open, without requiring the quota page to stay visible or making normal refreshes look like missing data.

## Requirements

### Requirement: Automatic refresh follows the open app window
The plugin SHALL automatically read quota for the explicitly selected host while its BB app-window instance is active, regardless of the current route, dashboard visibility, or sidebar accessory visibility. With normally running browser timers and successful requests, it SHALL initiate a periodic refresh 60 seconds after the preceding read completes. It SHALL read on initial activation and synchronize the selected host before automatic reads. It SHALL NOT choose a host automatically or initiate a quota read with no selected host.

#### Scenario: Dashboard is closed
- **WHEN** a host is selected, the quota dashboard is closed, and the automatic refresh becomes due in an active app window
- **THEN** the plugin reads that host's quota and updates the shared observation without opening the dashboard

#### Scenario: Compact navigation hides the badge
- **WHEN** the sidebar accessory is not mounted in a compact layout and the automatic refresh becomes due
- **THEN** the selected host's quota continues to refresh and the dashboard displays the latest shared observation when opened

#### Scenario: No host is selected
- **WHEN** the plugin is active with no selected host
- **THEN** it performs no quota read and continues to offer explicit host selection

### Requirement: Automatic work is shared and bounded
The dashboard, badge, periodic refresh, focus recovery, and manual refresh SHALL use a shared observation and coalesce simultaneous reads for the same selection within an app window. Mounting additional views SHALL NOT start additional automatic refresh loops. Requests from multiple app windows SHALL preserve the host's existing request coalescing and 30-second minimum upstream-attempt interval. A manual refresh SHALL NOT bypass this host-side interval.

#### Scenario: Dashboard and badge are both mounted
- **WHEN** a periodic read is pending and the dashboard and badge mount or request the same quota
- **THEN** they share the pending read and the resulting observation rather than initiating separate reads for the same selection

#### Scenario: Multiple windows request a refresh
- **WHEN** two app windows request the same host account's quota within the host retry interval
- **THEN** the host does not issue duplicate concurrent upstream requests or bypass its minimum attempt interval

### Requirement: Failures back off and suspended windows resume safely
After an unsuccessful automatic read, the plugin SHALL delay automatic retries for 60 seconds, then 120 seconds, then 240 seconds, then a capped 300 seconds after subsequent consecutive failures. A fresh successful result SHALL restore the normal cadence. Focus or resume notifications SHALL NOT bypass an outstanding failure backoff. Explicit manual refresh or a newly selected host SHALL permit an immediate app-side attempt while retaining host-side bounds. Browser throttling or suspension SHALL NOT cause a burst of missed refreshes on resume; the plugin SHALL recalculate freshness and initiate at most one due read.

#### Scenario: Repeated quota failures
- **WHEN** automatic quota reads repeatedly fail, whether through a rejected request or a stale or unavailable response
- **THEN** retries follow the bounded delay sequence and repeated focus events do not create a rapid retry loop

#### Scenario: A later read succeeds
- **WHEN** a retry returns a fresh successful observation
- **THEN** the shared view updates and the next automatic read returns to the normal cadence

#### Scenario: BB wakes after suspension
- **WHEN** an open app window resumes after browser timers were suspended
- **THEN** it recalculates the old observation's freshness and performs at most one overdue automatic read, subject to any remaining backoff

### Requirement: Refreshing does not hide still-fresh quota
During a quota read, the badge SHALL retain the last valid general remaining percentage only while the retained observation is still fresh and belongs to the current selection. Its accessible label SHALL identify the updating state, host, window, and original observation time. Initial loading with no valid observation SHALL show no percentage. Stale or unavailable observations SHALL NOT appear as a bare current percentage. The dashboard SHALL retain one concise updating or freshness status line and SHALL NOT add a loading spinner.

#### Scenario: Refresh starts with fresh quota
- **WHEN** a background or manual refresh starts while the current selection has a still-fresh 42% remaining observation
- **THEN** the badge continues to display 42% and its accessible label indicates an update with the original observation time

#### Scenario: Observation expires during an update
- **WHEN** a pending refresh outlasts the retained observation's five-minute freshness deadline
- **THEN** the badge stops showing a bare fresh percentage and the observation is visibly stale even before the request completes

#### Scenario: First observation is loading
- **WHEN** a quota read is pending and the selected host has no usable observation
- **THEN** the badge shows no percentage and exposes an accessible updating state

### Requirement: Lifecycle and selection changes invalidate old work
Automatic refresh SHALL stop initiating new reads when the plugin deactivates, reloads, or its app window tears down. Pending results from a disposed app-window owner SHALL NOT publish a new visible observation or restart its refresh loop. A host selection change SHALL clear the previous visible observation and retry schedule; late results from the previous selection SHALL NOT update the new selection. The host SHALL retain its existing active-account identity rechecks. No server-side or host-side polling service SHALL be introduced to continue quota collection after app windows close.

#### Scenario: Window closes during a read
- **WHEN** the last BB app window closes while its quota request is pending
- **THEN** no further automatic reads are initiated, and any already-dispatched request can finish only without reviving that window's owner or publishing into its disposed view

#### Scenario: Plugin reloads
- **WHEN** the frontend plugin generation is replaced while an old read is pending
- **THEN** the old owner releases its timers and listeners, its late result cannot update the replacement owner, and the replacement starts only its own refresh loop

#### Scenario: Selected host changes
- **WHEN** a new host is selected before the previous host's read completes
- **THEN** the previous percentage clears immediately, the new host is eligible for its initial read without the old host's backoff, and the previous result cannot appear for the new host

### Requirement: Existing freshness and privacy boundaries remain in force
Background refresh SHALL preserve the existing five-minute freshness deadline, 24-hour expiry, fixed content-free failure labels, and host-owned OAuth and quota parsing. A failed refresh SHALL NOT extend an observation's timestamp or make retained data fresh. No credential, raw upstream response, transcript, account-authentication identifier, model turn, or reset-redemption action SHALL be added to browser-facing refresh behavior. Authentication or account mismatch SHALL continue to discard data that cannot be safely attributed to the selected host account.

#### Scenario: Refresh fails after an observation
- **WHEN** a later refresh fails after quota was successfully observed
- **THEN** the plugin displays only an explicitly stale original observation or an unavailable state, never a fabricated fresh percentage or updated observation time

#### Scenario: Background OAuth and quota read
- **WHEN** an automatic refresh needs the selected host's existing Pi Codex credentials
- **THEN** authentication and raw quota responses stay on that host, the browser receives only bounded normalized quota or status, and no model turn or reset redemption occurs
