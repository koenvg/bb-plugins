## ADDED Requirements

### Requirement: Row control tooltips

Each icon-only control on a PR row SHALL show a tooltip with its label when the user points at it or moves keyboard focus to it. This applies to "Archive thread", "Mark reviewed" or "Mark as needs review", "Open on GitHub", and the CI state ("CI passed", "CI failed", "CI running", or "No checks"). The tooltip text SHALL be the same as the accessible name of the control. Controls that show a text label SHALL NOT show a tooltip.

#### Scenario: Hover the mark button

- **WHEN** the user points at the check icon on a PR in "Needs review"
- **THEN** a tooltip shows "Mark reviewed"

#### Scenario: Hover the mark button on a reviewed PR

- **WHEN** the user points at the undo icon on a PR in "Reviewed"
- **THEN** a tooltip shows "Mark as needs review"

#### Scenario: Keyboard focus on Open on GitHub

- **WHEN** the user moves keyboard focus to the GitHub icon on a PR row
- **THEN** a tooltip shows "Open on GitHub"

#### Scenario: Hover the CI state

- **WHEN** the user points at the CI icon of a PR whose checks failed
- **THEN** a tooltip shows "CI failed"

#### Scenario: Text buttons have no tooltip

- **WHEN** the user points at "Open thread" or "Review in thread"
- **THEN** no tooltip shows
