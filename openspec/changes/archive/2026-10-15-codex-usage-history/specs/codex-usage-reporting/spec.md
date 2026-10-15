# Spec delta

## Purpose

Explain selected-host Codex token use and captured estimated monetary value across calendar periods, using workspace totals and verified thread subsets with clear data limitations.

## ADDED Requirements

### Requirement: Shared 30-day calendar report

The dashboard SHALL show a fixed 30-day local-calendar range shared by history charts, summaries, rankings, and daily detail. The latest range SHALL end yesterday. Previous/Next SHALL move the whole range by 30 calendar days; navigation SHALL stop before the supported retained range and Next SHALL be disabled at the latest range. Boundaries SHALL use the viewer's IANA timezone including daylight-saving changes. History navigation SHALL neither refresh account quota/activity nor start import. Selecting another host SHALL clear or invalidate previous-host results immediately and late responses SHALL not replace the new selection.

#### Scenario: Navigate an older range

- **WHEN** the user activates Previous
- **THEN** the chart, summary, ranking, and detail move together by 30 local dates with no transcript import or account request

#### Scenario: Daylight-saving transition

- **WHEN** a usage instant falls near a local midnight in a range containing a daylight-saving change
- **THEN** it belongs to the correct local date in every report component without assuming each calendar day has 24 hours

#### Scenario: Change host while a report is loading

- **WHEN** a report for one host completes after the user selects a different host
- **THEN** its totals cannot appear in the new host's report

### Requirement: Workspace-first and exact-thread reports

The default report SHALL group usable usage by recorded workspace. A separate thread grouping SHALL include only verified exact-thread records. Each view SHALL show daily tokens, captured estimated cost, active entities with accepted usage, tokens per active entity, and captured estimated cost per priced active entity as selectable metrics. Entity counts SHALL mean workspaces or threads with usage, never completed work. Each event SHALL contribute at most once within a grouping. Workspace-only, unattributed, ambiguous, and unpriced records SHALL be disclosed separately where they are excluded from the chosen metric; a grouping SHALL not duplicate shared workspace usage into its thread rows.

#### Scenario: Workspace-only usage is usable

- **WHEN** a recorded event has a valid workspace and no verified thread binding
- **THEN** workspace totals include it once while exact-thread totals exclude it and disclose the exclusion

#### Scenario: Cost per priced active workspace

- **WHEN** one local day has two priced workspaces with captured cost of 4 and 6 monetary units and a third workspace with only unpriced tokens
- **THEN** the priced-subset average is 5, the token entity count includes all three, and the missing-price exclusion makes the cost metric partial

### Requirement: Captured monetary estimates and token breakdowns

The report SHALL preserve valid positive captured Pi cost at execution/import time and SHALL NOT reprice old records using current model prices, infer subscription charges, or convert quota percentages to money. Positive-token records with absent, invalid, or zero captured cost SHALL remain in token totals and be marked unpriced for cost metrics. Known cost subtotals SHALL remain visible with their priced-record coverage. No eligible priced records SHALL produce an unavailable cost metric rather than a fabricated zero. Available input, output, cache-read, cache-write, and reasoning token classes SHALL be shown without summing potentially overlapping classes into an invented total. Imported/replayed records SHALL retain their original recorded cost.

#### Scenario: Usage has tokens but zero captured cost

- **WHEN** a Pi record contains positive tokens and zero captured cost
- **THEN** tokens remain visible, cost is unknown for that record, and the report does not claim free usage or calculate a replacement price

#### Scenario: Model prices change

- **WHEN** model pricing changes after a message was recorded
- **THEN** that record's historical monetary estimate remains its valid captured value

#### Scenario: Reasoning overlaps output tokens

- **WHEN** a provider reports reasoning tokens as part of output tokens
- **THEN** the report displays the breakdown alongside the recorded total without adding reasoning a second time

### Requirement: Bounded ranking and inspectable values

The report SHALL show up to 50 entities ranked by recorded tokens, initially displaying ten, with workspace identity or verified BB thread title/link, token totals, captured estimated-cost subtotals, and attribution/coverage status. Deleted or archived threads SHALL retain their recorded history even when current metadata or navigation is unavailable. Accessible daily detail SHALL expose chart values, denominators, exclusions, coverage, and timezone without requiring pointer hover. The report SHALL disclose when the ranking is truncated rather than equating visible rows with all usage.

#### Scenario: More than ten active workspaces

- **WHEN** a range contains 20 workspaces with usage
- **THEN** the first ten ranked rows are shown with a way to reveal the remaining bounded rows and totals are not limited to the first ten

#### Scenario: Thread metadata is unavailable

- **WHEN** a previously verified thread is deleted or its title cannot be resolved
- **THEN** its retained usage remains in totals with a stable fallback label rather than disappearing or being moved to another thread

#### Scenario: Keyboard-only inspection

- **WHEN** the user navigates the report without a pointer
- **THEN** metrics, dates, entity selection, and daily values remain accessible without chart hover

### Requirement: Compatible comparisons and visible limitations

Prior-period percentage comparisons SHALL appear only when both 30-day ranges have compatible scope and complete coverage for the chosen metric. A zero prior baseline SHALL not produce an infinite percentage. Partial collection, import omissions, attribution exclusions, unpriced usage, stale indexes, and expired details SHALL be visible in summaries, chart marks, ranking rows where relevant, and detail values. Known subtotals SHALL remain inspectable when a total is incomplete. Loading, observed inactivity, incomplete, stale, and unavailable SHALL be distinct states, with unknown dates represented as gaps rather than zero-height numeric bars.

#### Scenario: Current range is partial

- **WHEN** the current range contains accepted usage but an uncovered interval or unpriced records for the cost metric
- **THEN** known subtotals remain visible with partial styling/labels and the incompatible prior-period percentage is withheld

#### Scenario: Prior baseline is zero

- **WHEN** both ranges are complete but the prior metric is zero
- **THEN** values remain visible without an infinite or misleading percentage change

### Requirement: Preserve quota access in responsive dashboard

The existing quota route, selected-host control, footer battery, reset countdowns, model-specific limits, banked-reset guidance, and official link SHALL remain usable. The expanded dashboard SHALL keep current quota and host controls visible above local history, with account activity/details and collector/import management in initially collapsed disclosures. At a 375px viewport controls SHALL wrap without overlap or horizontal page overflow, rankings SHALL remain readable, and history failure SHALL not hide quota. Neither the history view nor account details SHALL create a second quota polling owner.

#### Scenario: Compact report with unavailable history

- **WHEN** the dashboard is opened at 375px and history storage is unavailable
- **THEN** host selection, quota, countdowns, refresh, and the official link remain reachable without clipped controls or an obstructing history error

#### Scenario: Open management disclosure

- **WHEN** the user expands collection and history management
- **THEN** collector status, install/repair/pause/resume, import progress/resume/cancel, coverage, and storage/retention details are available without triggering their mutating actions automatically
