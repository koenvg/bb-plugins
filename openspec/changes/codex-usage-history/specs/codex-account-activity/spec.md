# Spec delta

## Purpose

Show normalized account-wide Codex token activity independently of local workspace and thread history, with explicit scope, freshness, and availability.

## ADDED Requirements

### Requirement: Separate account-wide activity
The plugin SHALL display supported account-wide activity returned for the selected host's Pi Codex account, including available lifetime and peak-daily token totals, daily/weekly activity, cumulative activity, turn-duration, and streak summaries. Each field SHALL be independently validated; unsupported fields SHALL remain unknown rather than zero. Activity SHALL be labeled account-wide and SHALL NOT be added to collected workspace/thread totals, used to fill collection gaps, or converted into monetary cost.

#### Scenario: Partial upstream activity
- **WHEN** Codex reports valid daily activity and lifetime tokens but omits streak statistics
- **THEN** the view shows the supported activity and labels missing streak statistics unknown without fabricating zeros

#### Scenario: Local and account totals differ
- **WHEN** account-wide tokens exceed locally recorded tokens
- **THEN** the two scopes remain separately labeled and local attribution does not receive the difference

### Requirement: Guarded independent activity refresh
The plugin SHALL obtain activity on the selected enrolled host using its existing Pi Codex authentication. Credentials, authentication claims, headers, and raw responses SHALL stay on that host. Activity reads SHALL be bounded and coalesced, recheck host/account identity before publishing results, and use fixed content-free failure codes. Failure of the activity endpoint SHALL NOT invalidate valid quota data or local history. A successful activity observation SHALL become stale after five minutes and unavailable after 24 hours; failed refreshes SHALL retain only an explicitly stale observation for the same confirmed identity with its original observation time.

#### Scenario: Activity endpoint fails but quota succeeds
- **WHEN** the activity request fails and a quota request returns a valid observation
- **THEN** quota remains visible and activity shows a fixed unavailable status or its valid retained stale observation

#### Scenario: Account changes during activity read
- **WHEN** the host's Pi Codex account changes or becomes uncheckable before the activity result is published
- **THEN** the old account's result and cached activity cannot appear under the new identity

#### Scenario: Activity observation expires
- **WHEN** an activity observation becomes 24 hours old without a successful replacement
- **THEN** its numeric activity is no longer displayed, even without a new request

### Requirement: Activity remains optional to history
Account activity SHALL remain accessible under account details without collector installation. Navigating local history periods SHALL NOT request new activity or quota data. Local captured history SHALL be labeled selected-host Pi usage, not history proven to belong to the currently signed-in Codex account.

#### Scenario: Change history report period
- **WHEN** the user moves to a previous 30-day history period
- **THEN** activity and quota observations retain their existing scope and refresh schedule without a period-navigation request

#### Scenario: No current sign-in but local history exists
- **WHEN** Pi authentication is unavailable on a host with retained usage history
- **THEN** local history remains readable and account activity reports authentication required without claiming that history belongs to a current account
