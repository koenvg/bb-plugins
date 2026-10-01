# Spec Delta

## Purpose

Show an enrolled host's Codex account allowance, next reset times, and reported banked resets in BB without collecting conversation or thread history.

## ADDED Requirements

### Requirement: Standalone host-owned account view
The plugin SHALL obtain Codex quota data through the selected enrolled host's Pi `openai-codex` account without calling, enabling, or depending on BB's Provider usage plugin or `system.usageLimits`. Credentials and raw upstream responses SHALL remain on that host. Browser-facing results SHALL contain only bounded, normalized account quota values and status, never access tokens, account IDs from authentication claims, request headers, transcript text, or arbitrary upstream error bodies. It SHALL NOT inspect Pi or BB session files, install a Pi collector, or present thread tokens and captured cost as account allowance. Before publishing a request result, the plugin SHALL recheck that its selected host and active Pi account still match the request; a changed or uncheckable identity SHALL discard the result rather than display another account's quota.

#### Scenario: Provider usage is disabled
- **WHEN** BB's built-in Provider usage plugin is disabled and a selected enrolled host has working Pi Codex OAuth
- **THEN** the account quota view works without a BB provider-usage call or any transcript read

#### Scenario: Selected host is unavailable
- **WHEN** the selected host is offline or has no usable Pi Codex account
- **THEN** the view says unavailable or shows an explicitly stale observation, never another host's allowance or a fabricated zero

#### Scenario: Account or host changes during a quota request
- **WHEN** the selected host or its active Pi account changes before an earlier quota request completes
- **THEN** the old request cannot update the cache or appear in the new selection's sidebar or dashboard

### Requirement: Reported allowance windows and reset times
The plugin SHALL display the remaining percentage for each valid Codex general allowance window reported for the selected account, together with its window name, observation time, and next reset time when provided. It SHALL keep model-specific or other reported limits separate from general windows. The summary SHALL use the lowest valid remaining percentage among general windows, with an identified binding window; it SHALL NOT add percentages or represent them as exact remaining tokens or money. Missing or invalid percentages and reset times SHALL be unknown rather than zero. A reported 0% used SHALL yield 100% remaining, and a reported 100% used SHALL yield 0% remaining.

#### Scenario: Different general windows
- **WHEN** fresh general windows report 35% and 70% used
- **THEN** the summary shows 30% remaining in the 70%-used window and the dashboard shows both windows with their own reset times when available

#### Scenario: No valid general percentage
- **WHEN** the upstream reports no valid general window percentage
- **THEN** the summary says unavailable instead of showing 0% remaining; any valid separate limits remain labeled separately

### Requirement: Banked reset availability and official link
The plugin SHALL show a nonnegative banked-reset count only when Codex explicitly reports a valid count. It SHALL distinguish zero available from unknown availability. It SHALL link to the official Codex Usage page at `https://chatgpt.com/codex/settings/usage` for details, expiration, and user-controlled redemption. It SHALL NOT offer an in-plugin action that spends or applies a reset. The link SHALL remain usable when quota data is unavailable, and the UI SHALL NOT assume the browser's signed-in account matches the selected host's Pi account.

#### Scenario: Reset count is present
- **WHEN** Codex reports two available banked resets
- **THEN** the view says two are available and provides the official usage link without a redeem action

#### Scenario: Reset count is absent
- **WHEN** the response contains no valid reset count
- **THEN** the view says reset availability is unknown and still provides the official usage link

### Requirement: Sidebar and dashboard share a scoped snapshot
The plugin SHALL provide a BB sidebar entry and dashboard for a selected host's Pi Codex account. Where BB supports a live sidebar badge, the badge SHALL show the fresh general-window summary as a visible percentage remaining with an accessible window, host, and observation label. Dashboard and badge SHALL share one account selection and normalized snapshot, without combining hosts or accounts. The dashboard SHALL use one concise observation status line rather than duplicate freshness and timestamp lines, and SHALL not show a loading spinner. The navigation entry and the dashboard's quota summary and official link SHALL remain reachable in compact layouts where BB hides the badge. Stale, offline, loading, or missing selection SHALL NOT look like a fresh percentage.

#### Scenario: Activate the sidebar entry
- **WHEN** the user opens the Codex Quota entry with mouse or keyboard
- **THEN** the dashboard retains the selected host, displays the quota windows and reset availability, and offers the Codex Usage link

#### Scenario: Compact or stale view
- **WHEN** the badge is hidden on a compact viewport or the selected host's snapshot is stale
- **THEN** dashboard navigation still works and any old percentage is labeled stale rather than current

### Requirement: Fail-closed freshness and acceptance
The plugin SHALL bound host requests and cache only normalized quota snapshots on the owning host. A successful observation SHALL be labeled fresh for at most five minutes, then stale until a new successful read; data older than 24 hours SHALL be unavailable even without an attempted refresh. It SHALL show the original observation time, label a retained observation stale after a refresh error, and change freshness labels as time passes in an open view. Authentication, network, unsupported response, and missing fields SHALL have fixed, content-free status or diagnostic labels. Installed acceptance SHALL require a real selected-host Pi OAuth and Codex quota observation with Provider usage disabled, plus failure-state and privacy tests; a synthetic response or a report of an unavailable host SHALL NOT count as passing.

#### Scenario: Refresh fails after a successful observation
- **WHEN** the selected host has a previously observed snapshot and a later refresh fails
- **THEN** the dashboard labels the prior values stale with their original observation time, or unavailable after 24 hours, without logging a token or arbitrary server response

#### Scenario: A successful snapshot ages without another refresh
- **WHEN** an open dashboard or sidebar has a successful quota observation that becomes more than five minutes old without another successful fetch
- **THEN** it stops presenting that percentage as fresh, labels it stale with its observation time, and shows unavailable after 24 hours

#### Scenario: Only synthetic checks pass
- **WHEN** unit tests pass but the installed host has not returned a real authenticated Codex quota snapshot
- **THEN** the live acceptance task remains incomplete and the plugin is not described as verified
