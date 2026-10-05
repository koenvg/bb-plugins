## MODIFIED Requirements

### Requirement: Project-scoped guidance

The Code Cleanup plugin SHALL contribute cleanup instructions only to newly constructed agent sessions for standard BB projects whose effective enabled state is true. An explicit project choice SHALL take precedence over the saved default; projects without an explicit choice SHALL follow that default. The default SHALL initially be disabled. The plugin SHALL contribute nothing for personal or projectless contexts or side chats. Changing one project's explicit choice SHALL NOT change another project's saved choice or prompt.

#### Scenario: Enabled project

- **WHEN** a fresh agent session starts for a standard project with Code Cleanup effectively enabled
- **THEN** that session receives the project's cleanup guidance exactly once

#### Scenario: Other project or side chat

- **WHEN** a fresh agent session starts for an effectively disabled project, a personal or projectless context, or a side chat
- **THEN** it receives no Code Cleanup guidance

#### Scenario: New project follows enabled default

- **WHEN** the saved default is enabled and a fresh session starts for a new standard project without an explicit choice
- **THEN** that session receives the factory guidance unless the project has a custom prompt

#### Scenario: Explicit disable takes precedence

- **WHEN** the saved default is enabled but a standard project is explicitly disabled
- **THEN** a fresh session for that project receives no Code Cleanup guidance

### Requirement: Agent-judged follow-ups

The default guidance SHALL tell the agent to notice substantial, actionable cleanup in files it edits or adjacent code it reads, record a separate follow-up task when warranted, and stay focused on the current task. It SHALL explicitly exclude minor style preferences and trivial nits and direct the agent not to perform unrelated cleanup or dispatch workers. The plugin itself SHALL NOT inspect source code or create tasks automatically; task creation SHALL remain an agent action based on the guidance.

#### Scenario: Substantial adjacent cleanup

- **WHEN** an agent finds a separate, worthwhile cleanup issue while carrying out an existing task
- **THEN** the guidance directs the agent to judge whether to record it as a follow-up task rather than perform unrelated cleanup in the current task

#### Scenario: Minor nit

- **WHEN** the only finding is a trivial formatting or style preference
- **THEN** the guidance directs the agent not to record a cleanup task for it

### Requirement: Report follow-up candidates

The default guidance SHALL direct the agent to record a worthwhile follow-up through the installed `bb tasks` CLI and report the confirmed task key to the user. The guidance SHALL require a single task tracker linked to the current BB project, an open-task duplicate check with complete search pagination, and an actionable title and description containing the location, problem, desired outcome, completion criteria, and known source task or thread. It SHALL direct the agent to reuse a matching open task, use labels only when they already exist, and add a blocker only for a known required prerequisite. It SHALL NOT use OpenForge commands or unsupported task flags, invent task keys, dispatch workers, change the current task's status, or claim success after a failed command. When recording is unavailable or fails, it SHALL direct the agent to report the candidate and the specific limit to the user.

#### Scenario: Substantial cleanup worth reporting

- **WHEN** the agent judges that a substantial follow-up is warranted and a single linked tracker is available
- **THEN** the guidance asks it to check for an existing open task and create an actionable task only if no matching task exists
- **AND** it directs the agent to report the confirmed existing or new key and continue the assigned work

#### Scenario: Matching open task

- **WHEN** the agent finds an existing open task covering the same cleanup
- **THEN** the guidance directs it to reuse that task and not create a duplicate

#### Scenario: Missing or ambiguous tracker

- **WHEN** the task CLI is unavailable or no single tracker is linked to the current BB project
- **THEN** the guidance directs the agent to report the candidate and ask for a linked tracker or available CLI
- **AND** it prohibits filing the task in another project's tracker or automatically provisioning a tracker

#### Scenario: Required prerequisite

- **WHEN** a cleanup task must wait for the current task or another known prerequisite
- **THEN** the guidance directs the agent to add that prerequisite as a blocker using its verified task key
- **AND** a failed dependency write is reported as a limit rather than complete recording

#### Scenario: Recording fails

- **WHEN** the create command fails or returns no confirmed task key
- **THEN** the guidance directs the agent to report the candidate and error without claiming that a task was created

### Requirement: Project configuration and overrides

A user SHALL be able to enable or disable Code Cleanup separately for each standard project, return a project to the saved default, view its effective state and source, replace its factory guidance with a nonblank project-specific instruction, and restore the factory prompt. Prompt reset SHALL NOT reset enablement, and enablement reset SHALL NOT remove custom text. Project choices and overrides SHALL persist across plugin reloads and global disable/re-enable without changing another project's saved choices. Invalid custom instructions, including whitespace-only text and text longer than 4,096 characters, SHALL be rejected without changing the saved value. Valid custom text SHALL be preserved exactly and SHALL replace, not append to, the factory prompt.

#### Scenario: Independent project choices

- **WHEN** the user enables a project and customizes its guidance
- **THEN** only that project uses the custom guidance
- **AND** other projects retain their saved explicit choices or continue to follow the default

#### Scenario: Disable and re-enable a project

- **WHEN** the user disables and later re-enables a project
- **THEN** fresh sessions omit guidance while it is disabled and use its saved custom guidance once it is re-enabled

#### Scenario: Invalid replacement

- **WHEN** the user submits an empty, whitespace-only, or over-limit custom instruction
- **THEN** the change is rejected and the previous project configuration remains effective

#### Scenario: Prompt-only edit on an inherited project

- **WHEN** a project follows the default and the user saves or resets its custom prompt
- **THEN** it continues to follow the default and no explicit enablement choice is introduced

#### Scenario: Return to the default

- **WHEN** the user removes a project's explicit enablement choice
- **THEN** that project immediately follows the current saved default
- **AND** its custom prompt remains unchanged

## ADDED Requirements

### Requirement: Preserve saved configuration on upgrade

Upgrading Code Cleanup SHALL preserve each existing project's effective enablement and exact custom prompt. Existing enabled and disabled states SHALL become explicit choices, including disabled rows that were created by saving a prompt. The new default SHALL initially be disabled. Migration SHALL be repeat-safe and SHALL NOT rewrite saved custom text to the new factory task-creation guidance.

#### Scenario: Existing configured project

- **WHEN** a project with a saved enabled state and multiline custom prompt is upgraded
- **THEN** it remains explicitly enabled and its exact prompt text is unchanged

#### Scenario: Existing disabled project

- **WHEN** a project with saved disabled state or a prompt-only disabled row is upgraded and the user later enables the default
- **THEN** that project remains explicitly disabled and retains its custom text

#### Scenario: Repeated plugin reload

- **WHEN** the upgraded plugin reloads more than once
- **THEN** saved explicit choices, inherited states, and prompt text are not migrated again or changed
