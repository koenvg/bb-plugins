# tasks-browse-context Specification

## Purpose

Keeps Tasks focused on the user's last selected project while preserving explicit navigation and making project selection available beside the ticket list.

## Requirements

### Requirement: Remember the selected project scope

Tasks SHALL remember the last selected Tasks project, or the explicit All projects choice, across panel reopening and page refresh in the same browser profile. The remembered scope SHALL be shared across BB projects within that profile rather than stored separately for each BB project. Project selection SHALL NOT depend on which BB project is currently open. Existing per-project list/board preferences SHALL remain effective.

#### Scenario: Reopen the selected project

- **WHEN** the user selects Tenet, leaves Tasks, and reopens Tasks without an explicit destination
- **THEN** Tasks opens Tenet rather than the cross-project list
- **AND** Tenet's saved list/board preference is respected

#### Scenario: Refresh and change BB projects

- **WHEN** the last selected Tasks project is Tenet and the user refreshes or opens Tasks from another BB project without an explicit destination
- **THEN** the selected Tasks project remains Tenet

#### Scenario: Remember All projects

- **WHEN** the user explicitly selects All projects and subsequently reopens Tasks without an explicit destination
- **THEN** Tasks shows All projects rather than restoring an older project selection

### Requirement: Explicit destinations take precedence

An explicit All projects, project, Active, Manage, or task destination SHALL take precedence over the remembered scope. A direct task link SHALL open the named ticket without requiring the user to select its project first. Active, Manage, and direct task navigation SHALL NOT overwrite the remembered project-or-All scope. An explicit project or All projects selection SHALL update that scope.

#### Scenario: Explicit project link

- **WHEN** Tenet is remembered and the user opens an explicit ClassSpotter project destination
- **THEN** Tasks shows ClassSpotter
- **AND** a later undirected Tasks entry restores ClassSpotter

#### Scenario: Explicit All projects command

- **WHEN** Tenet is remembered and the user invokes Go to All tasks
- **THEN** Tasks shows All projects and remembers that choice

#### Scenario: Direct task link from another project

- **WHEN** Tenet is remembered and the user opens a direct ClassSpotter task link
- **THEN** Tasks opens that ClassSpotter ticket
- **AND** a later undirected Tasks entry still restores Tenet

#### Scenario: Active and Manage remain explicit destinations

- **WHEN** Tenet is remembered and the user opens Active or Manage
- **THEN** the requested destination opens
- **AND** the remembered Tenet scope is unchanged

### Requirement: Restore scope safely

When no valid remembered scope exists, Tasks SHALL default to All projects. A missing remembered project SHALL fall back only after the available projects have loaded successfully. A failed project lookup SHALL offer retry rather than treating a remembered project as deleted. Missing, malformed, unsupported, or unavailable preference storage SHALL NOT prevent Tasks from opening or accepting a new project selection.

#### Scenario: First use

- **WHEN** Tasks opens without an explicit destination and no scope has been remembered
- **THEN** Tasks shows All projects

#### Scenario: Deleted remembered project

- **WHEN** the remembered project is absent from a successfully loaded project inventory
- **THEN** Tasks uses All projects instead of leaving an unusable project selection

#### Scenario: Project inventory is still loading

- **WHEN** Tasks opens with a remembered project and the project inventory has not loaded
- **THEN** Tasks waits to validate the remembered selection rather than replacing it with All projects

#### Scenario: Project inventory fails

- **WHEN** the project inventory cannot load
- **THEN** Tasks shows a retryable error
- **AND** does not overwrite the remembered project scope

#### Scenario: Preference storage cannot be used

- **WHEN** stored preferences cannot be parsed or browser storage access fails
- **THEN** Tasks still opens and permits project selection for the current session

### Requirement: Project selection belongs to browsing controls

The project selector SHALL be available above the ticket list and SHALL display the current scope. It SHALL offer All projects and existing projects, retaining folder organization where present. Project switching SHALL update the list, available labels, new-task project default, and scoped list preferences together. Active, Manage, project creation, and preset management SHALL remain reachable without occupying a permanent right-hand navigation column. Existing explicit Active behavior SHALL remain cross-project.

#### Scenario: Switch projects from the list

- **WHEN** the user changes the selector from Tenet to ClassSpotter
- **THEN** the list shows ClassSpotter tasks with ClassSpotter's saved filters and sort
- **AND** project-scoped task creation and label controls use ClassSpotter
- **AND** no previously selected Tenet ticket remains shown as ClassSpotter's selection

#### Scenario: Access secondary destinations

- **WHEN** the user is browsing a project's tickets
- **THEN** Active, Manage, project creation, and preset management remain reachable from browsing controls or their menus
- **AND** the right-hand area is available for ticket detail rather than permanent project navigation

#### Scenario: No projects exist

- **WHEN** the project inventory loads successfully with no projects
- **THEN** Tasks shows a project-creation action rather than an empty project selector that cannot be used
