## MODIFIED Requirements

### Requirement: Expand and collapse a PR file

Each file section of the Review tab that shows a diff SHALL have a button in its header to collapse or expand the section. The button SHALL NOT change the mark. A viewed file SHALL start collapsed and another file SHALL start expanded. A viewed file with a new comment SHALL start expanded. A toggle by the button SHALL stay when the user switches tabs or threads, and SHALL be lost when bb reloads, when the user checks or unchecks "Viewed", or when the mark drops.

#### Scenario: Expand a viewed file

- **WHEN** `src/a.ts` is viewed and the user clicks its expand button
- **THEN** the section shows its diff, "Viewed" stays checked, and the counter does not change

#### Scenario: Collapse a file that is not viewed

- **WHEN** the user clicks the collapse button of `src/b.ts`, which is not viewed
- **THEN** the section shows only its header and "Viewed" stays unchecked

#### Scenario: Expanded viewed file after a reload

- **WHEN** the user expands a viewed `src/a.ts` and reloads bb
- **THEN** `src/a.ts` is collapsed

#### Scenario: Viewed file with a new comment

- **WHEN** `src/a.ts` is viewed and has a new comment, and the user opens the Review tab
- **THEN** `src/a.ts` is expanded and "Viewed" stays checked
