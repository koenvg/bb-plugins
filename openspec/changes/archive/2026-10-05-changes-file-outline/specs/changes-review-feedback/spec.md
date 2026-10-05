## MODIFIED Requirements

### Requirement: Review prompt
"Send feedback (N)" SHALL show N, the number of pending comments, and SHALL be disabled when N is 0. Clicking it SHALL open a dialog with the review prompt in an editable text box. The prompt SHALL start with "Please address the following review comments:" and list each comment as a numbered line `` `path:line` - text ``, with " (deleted line)" after the line number for old-side comments, in file outline order and then line order. It SHALL end with an instruction to check each comment against the current code first, fix the valid ones at their location, and explain why for each comment that is invalid, stale, or already addressed.

#### Scenario: Prompt content
- **WHEN** the pending review has a comment "Null check missing" on new line 42 of `src/a.ts` and a comment "Why remove this?" on old line 10 of `src/b.ts`
- **THEN** the prompt lists `` 1. `src/a.ts:42` - Null check missing `` and `` 2. `src/b.ts:10 (deleted line)` - Why remove this? ``

#### Scenario: Nothing pending
- **WHEN** the pending review is empty
- **THEN** "Send feedback (0)" is disabled

#### Scenario: Folder before file in the prompt
- **WHEN** the pending review has a comment on `src/b.ts` and a comment on `src/ui/a.ts`
- **THEN** the prompt lists the comment on `src/ui/a.ts` first
