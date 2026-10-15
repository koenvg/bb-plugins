# Spec delta

## MODIFIED Requirements

### Requirement: Standalone host-owned account view

The plugin SHALL obtain Codex quota data through the selected enrolled host's Pi `openai-codex` account without calling, enabling, or depending on BB's Provider usage plugin or `system.usageLimits`. Credentials and raw upstream responses SHALL remain on that host. Browser-facing quota results SHALL contain only bounded, normalized account quota values and status, never access tokens, account IDs from authentication claims, request headers, transcript text, or arbitrary upstream error bodies. Quota acquisition and refresh SHALL NOT inspect Pi or BB session files, install or require a Pi collector, start historical import, or present thread tokens and captured cost as account allowance. The plugin SHALL permit a separate user-installed usage collector and user-started historical import under the history capability, without making either a prerequisite for quota display. Before publishing a quota request result, the plugin SHALL recheck that its selected host and active Pi account still match the request; a changed or uncheckable identity SHALL discard the result rather than display another account's quota.

#### Scenario: Provider usage is disabled

- **WHEN** BB's built-in Provider usage plugin is disabled and a selected enrolled host has working Pi Codex OAuth
- **THEN** the account quota view works without a BB provider-usage call or any transcript read

#### Scenario: Selected host is unavailable

- **WHEN** the selected host is offline or has no usable Pi Codex account
- **THEN** the view says unavailable or shows an explicitly stale observation, never another host's allowance or a fabricated zero

#### Scenario: Account or host changes during a quota request

- **WHEN** the selected host or its active Pi account changes before an earlier quota request completes
- **THEN** the old request cannot update the cache or appear in the new selection's sidebar or dashboard

#### Scenario: History has not been enabled

- **WHEN** no collector is installed and no historical import has run
- **THEN** quota display, footer navigation, reset countdowns, and the official usage link remain available without history setup

#### Scenario: History storage fails

- **WHEN** local usage history storage or ingestion becomes unavailable
- **THEN** quota requests and their existing refresh and freshness behavior continue independently

#### Scenario: Quota refresh while history exists

- **WHEN** the user refreshes account quota after installing the collector or importing history
- **THEN** that quota operation neither discovers nor reads transcripts, changes history coverage, nor initiates another import
