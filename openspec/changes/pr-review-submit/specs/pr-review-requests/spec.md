## MODIFIED Requirements

### Requirement: Review prompt
The review prompt SHALL tell the agent to run `gh pr checkout <number>` first, then review the PR. It SHALL include the PR URL and title. It SHALL tell the agent to save each finding on a file and line with `bb github-insight review comment`, and to save one review summary with `bb github-insight review summary`. It SHALL tell the agent not to post comments or reviews to GitHub.

#### Scenario: Prompt content
- **WHEN** the composer opens for `acme/api#15` titled "Add rate limits"
- **THEN** the prompt contains `gh pr checkout 15`, the PR URL, the title "Add rate limits", and an instruction not to post to GitHub

#### Scenario: Prompt names the draft commands
- **WHEN** the composer opens for any review request
- **THEN** the prompt contains `bb github-insight review comment` and `bb github-insight review summary`
