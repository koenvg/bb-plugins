# tasks-fork Specification

## Purpose

Defines how the forked Tasks plugin in this repo replaces the bundled bb Tasks plugin while keeping existing data, commands, and agent workflows intact.

## Requirements

### Requirement: Fork keeps the bundled behavior

The fork SHALL retain bundled Tasks v0.1.2 projects, folders, labels, priorities, due dates, subtasks, task attachments, presets, delegation, live thread cards and task mentions, except where an explicit spec change says otherwise. Task comments SHALL NOT be supported. Removing comments SHALL NOT remove underlying task or thread state transitions.

#### Scenario: Existing workflow

- **WHEN** a user creates a task, adds a subtask, and delegates it with a preset in the fork
- **THEN** creation, subtask behavior and delegation work as before
- **AND** no task comment is created for those actions

#### Scenario: Thread finishes

- **WHEN** an attached worker completes or fails
- **THEN** its live thread card reflects the terminal state without a task comment or automatic task completion

### Requirement: Own plugin identity

The fork SHALL use a plugin id that is not a bundled bb plugin id. Its display name SHALL be "Tasks".

#### Scenario: Install the fork

- **WHEN** a user installs the fork from this repo
- **THEN** bb accepts the install and shows the plugin as "Tasks"

### Requirement: Same CLI command

The fork SHALL register `bb tasks` with retained bundled subcommands and dependency flags. It SHALL NOT register the comment subcommand or comment-posting flags. Task detail text and JSON reads SHALL omit comments and activity history while retaining current task properties, blockers, blocked tasks, subtasks, task attachments and linked threads.

#### Scenario: Agent uses the CLI

- **WHEN** the bundled plugin is disabled, the fork is installed, and an agent runs `bb tasks show ABC-12`
- **THEN** the fork returns the task's retained details with no Comments section or comments field

#### Scenario: Old comment command

- **WHEN** a caller invokes `bb tasks comment ABC-12 --body "Update" --notify`
- **THEN** normal unknown-command behavior is returned without task mutation or notification
- **AND** command discovery does not offer a comment command

### Requirement: One-time data import

The system SHALL document copying bundled Tasks data into the fork without changing the source and SHALL refuse to overwrite a fork with tasks. Imported tasks, keys, labels, folders, projects, presets, thread links and files SHALL remain available. Before serving imported task reads, the fork SHALL remove comment records and convert comment-owned files to task attachments.

#### Scenario: Import

- **WHEN** a user imports 18 bundled tasks with task and comment attachments
- **THEN** the fork has the same 18 tasks and keys
- **AND** attachment content and IDs remain available under their owning tasks, with no comment history
- **AND** source tasks, comments and files remain unchanged

#### Scenario: Import twice

- **WHEN** a user runs the import step and the fork already has tasks
- **THEN** the step stops with an error and changes nothing

### Requirement: Rollback

A user SHALL be able to go back to the bundled Tasks plugin by uninstalling the fork and enabling the bundled plugin. The data of the bundled plugin SHALL be as it was before the import. Changes made in the fork SHALL NOT carry back.

#### Scenario: Go back

- **WHEN** a user uninstalls the fork and runs `bb plugin enable tasks`
- **THEN** the bundled plugin shows the tasks as they were before the import

### Requirement: Comment interfaces are unavailable

Tasks SHALL NOT expose comment creation, comment listing, task activity history, comment notifications or comment realtime events. The removed `createComment`, `listComments` and `getTaskActivity` RPCs SHALL use normal unavailable behavior, without aliases or compatibility stubs. No removed operation SHALL write data, upload files, send native input or resume a thread.

#### Scenario: Old RPC caller

- **WHEN** a caller invokes a removed comment or activity RPC
- **THEN** the operation is unavailable and produces no task, file or thread side effect

#### Scenario: Task operation completes

- **WHEN** a retained task, dispatch or thread-state operation succeeds
- **THEN** retained task/thread updates are published without a comments event

### Requirement: Comment-free upgrade preserves retained records

Opening a pre-removal database SHALL delete task comment records and remove active comment storage and attachment comment ownership. Existing migration version history SHALL remain intact. Tasks, dependencies, configuration, presets, thread links and inactive Orchestrator history SHALL remain unchanged except for explicitly retained task/thread operations.

#### Scenario: Upgrade populated data

- **WHEN** Tasks opens an existing database with user, agent and system comments
- **THEN** no active comment storage or attachment comment-owner field remains after upgrade
- **AND** retained records and prior migration history remain intact

#### Scenario: Fresh database and repeated startup

- **WHEN** Tasks initializes an empty database or reopens an upgraded database
- **THEN** the active schema is comment-free and retained task operations work

#### Scenario: Migration fails

- **WHEN** the comment-removal database migration cannot complete
- **THEN** its changes are rolled back without partially deleting comments or changing attachment ownership
- **AND** the failure is reported rather than serving partially upgraded task state

### Requirement: Attachments belong to tasks

All retained attachments SHALL belong to a task. Upgrading SHALL convert comment-owned attachments to the comment's owning task while preserving file content, metadata, attachment IDs and download URLs. Public attachment operations SHALL reject comment ownership selectors and SHALL NOT silently redirect them to another owner.

#### Scenario: Preserve an old comment attachment

- **WHEN** an attachment belongs to a comment on ABC-12 before upgrade
- **THEN** the same attachment is listed on ABC-12 after upgrade and remains downloadable through its existing URL
- **AND** it is not listed on an unrelated task

#### Scenario: Old attachment owner input

- **WHEN** a caller supplies a comment owner through a CLI option, RPC field, HTTP query or upload header
- **THEN** the request is rejected without uploading, removing or reassigning a file
