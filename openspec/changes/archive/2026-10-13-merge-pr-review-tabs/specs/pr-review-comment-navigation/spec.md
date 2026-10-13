# Spec Delta

## MODIFIED Requirements

### Requirement: Palette commands for next and previous comment

The plugin SHALL add the palette commands "GitHub: Next comment" and "GitHub: Previous comment". They SHALL be available only when the thread has a PR. A command SHALL open the PR tab on "Files" when it is not open there, then do the same jump as the matching stepper button. The commands SHALL NOT have a default keyboard shortcut.

#### Scenario: Next comment from the palette with the Review tab closed

- **WHEN** the thread has a PR with open threads, the PR tab is closed, and the user runs "GitHub: Next comment"
- **THEN** the PR tab opens on "Files" and jumps to the first comment at or below the top of the diff area

#### Scenario: Next comment from the palette with Overview selected

- **WHEN** the PR tab shows "Overview" and the user runs "GitHub: Next comment"
- **THEN** the PR tab shows "Files" and jumps to the first comment at or below the top of the diff area

#### Scenario: Thread without a PR

- **WHEN** the thread has no PR
- **THEN** the palette does not offer "GitHub: Next comment" or "GitHub: Previous comment"

#### Scenario: No comments in the Review tab

- **WHEN** the user runs "GitHub: Next comment" and "Files" has no comments
- **THEN** the PR tab opens on "Files" and does not scroll
