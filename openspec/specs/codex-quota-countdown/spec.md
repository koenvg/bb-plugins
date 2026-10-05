# codex-quota-countdown Specification

## Purpose

Let users see how much time remains until Codex quota windows reset without calculating from a date, while keeping stale-data warnings visible.

## Requirements

### Requirement: Reset countdown placement

The dashboard SHALL display the binding general window's time until reset beneath the remaining percentage alongside its window label. Each general and additional window SHALL display its own countdown and retain its exact reset date and timezone. Missing or invalid reset timestamps SHALL show "Reset unknown" rather than a fabricated duration. A missing binding window or unavailable snapshot SHALL NOT produce a summary countdown.

#### Scenario: Weekly binding window

- **WHEN** the binding window is named "7 days" and resets in six days and six hours
- **THEN** the summary displays "6 days, 6 hours left · 7 days window" and the window row displays the same countdown with its exact reset date

#### Scenario: Different windows

- **WHEN** general and additional windows have different reset times
- **THEN** each row shows its own countdown and the summary uses only the binding general window

#### Scenario: Unknown reset

- **WHEN** a displayed window has no valid reset timestamp
- **THEN** its reset timing is labeled "Reset unknown" without a numeric countdown or invalid date

#### Scenario: No usable snapshot

- **WHEN** data is pending, unavailable, or expired
- **THEN** no countdown from a hidden or discarded snapshot is displayed

### Requirement: Duration formatting and passage of time

Countdowns SHALL use elapsed time between the current clock and the reported reset instant, not calendar-day differences. At least one day SHALL be shown in whole days and remaining whole hours; below one day in whole hours and remaining whole minutes; below one hour in whole minutes. Zero trailing units SHALL be omitted and units SHALL use correct singular or plural forms. Positive durations below one minute SHALL display "Less than a minute left". At or after the reset instant the display SHALL say "Reset due" without negative durations or claiming the allowance has renewed. While the page is active, countdowns SHALL advance within one minute without manual refresh or additional quota requests.

#### Scenario: Unit boundaries

- **WHEN** remaining durations are exactly one day, one hour, and one minute
- **THEN** the corresponding labels are "1 day left", "1 hour left", and "1 minute left"

#### Scenario: Fractional units

- **WHEN** the remaining time is one day, two hours, and forty minutes
- **THEN** the label is "1 day, 2 hours left" without rounding up

#### Scenario: Less than a day

- **WHEN** the remaining time is three hours and fifteen minutes
- **THEN** the label is "3 hours, 15 minutes left"

#### Scenario: Reset approaches and passes

- **WHEN** the remaining time moves from thirty seconds to zero
- **THEN** the label changes from "Less than a minute left" to "Reset due" without changing the reported remaining percentage

#### Scenario: Time advances without a freshness transition

- **WHEN** an active page's clock advances while its snapshot remains fresh or remains stale
- **THEN** its countdown updates within one minute without another quota request

### Requirement: Quiet fresh summary with preserved warnings

A fresh, idle dashboard with an available allowance SHALL NOT display the routine "Updated…" observation line. It SHALL retain updating, stale, authentication, offline, missing-selection, and unavailable feedback when applicable. Stale observations SHALL remain identified as stale with their original observation time. Removing the fresh timestamp SHALL NOT remove sidebar observation metadata or change freshness expiry rules.

#### Scenario: Fresh allowance

- **WHEN** a fresh allowance is displayed and no refresh is in progress
- **THEN** the summary shows the percentage and reset timing without an "Updated…" line

#### Scenario: Retained stale allowance

- **WHEN** a retained snapshot becomes stale or a refresh fails
- **THEN** the dashboard still warns that the observation is stale and shows its original observation time

#### Scenario: Refresh in progress

- **WHEN** a quota refresh is in progress
- **THEN** updating feedback remains visible without a loading spinner

#### Scenario: Missing general allowance

- **WHEN** a snapshot has separate limits but no valid general allowance
- **THEN** the summary still identifies the allowance as unavailable instead of becoming silently blank
