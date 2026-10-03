# Spec Delta

## Purpose

Lets users scan consecutive tasks without repeated loading gaps, while keeping task identity, unsaved work, live updates, and secondary task actions correct.

## ADDED Requirements

### Requirement: Warm task navigation has a measured response budget
In the controlled browser benchmark defined for this change, Tasks SHALL present the accepted task's heading and rendered description within 100 ms at p95 for warm, unsaved-edit-free keyboard navigation. A warm task is one whose current preview data has already loaded and has not been invalidated. Measurements SHALL run with Tasks and Codex quota enabled, no CPU throttling, a fixed viewport and dataset, and at least 30 recorded movements after warm-up. The report SHALL identify the source and bundle versions, machine, browser, dataset, and timing method. Cold selections and transitions waiting for real saves SHALL be reported separately, not counted as warm successes.

#### Scenario: Move between previously loaded tasks
- **WHEN** the user moves up and down through the warmed visible order in the controlled benchmark
- **THEN** the accepted task's heading and rendered description meet the 100 ms p95 budget
- **AND** list order, scroll position, and row selection remain correct

#### Scenario: Report a cold selection or pending save
- **WHEN** preview data has not loaded, has been invalidated, or navigation waits for a pending save
- **THEN** its timing is reported separately with the applicable wait
- **AND** it does not improve the reported warm percentile by being omitted without explanation or classified as a warm success

### Requirement: Accepted selection and preview always identify the same task
Cached data, background loading, and rapid movement SHALL NOT show another task's content as the accepted selection. A warm selection SHALL NOT clear its available matching description merely to wait for the same read again. A cold selection SHALL show its own task identity and loading state, leave the list usable, and offer retry on failure. A failed background read SHALL distinguish retained matching data from a confirmed current response. Confirmed absence SHALL follow the existing safe selection-clearing behavior.

#### Scenario: Return to a warm task
- **WHEN** the user selects A, selects B, and returns to A while A's preview data is still current
- **THEN** A's available heading and description appear without an intermediate empty detail view
- **AND** A's unsent comment and staged files remain associated with A

#### Scenario: A slow earlier response completes
- **WHEN** the user accepts C after requesting B and B's read completes later
- **THEN** the selected row, detail content, focus intent, and selection-dependent actions remain associated with C

#### Scenario: Cold task read fails
- **WHEN** the accepted task has no available preview and its lookup fails
- **THEN** the detail area shows that task's identity and a retry action
- **AND** the list remains usable without presenting the previous task as the new selection

### Requirement: Reused data remains bounded and respects invalidation
Preview retention and speculative reads SHALL have finite capacity and concurrency limits. Speculative reads SHALL concern only adjacent tasks in the successfully settled visible order, SHALL NOT block a selected-task read, and SHALL NOT perform mutations, submit comments, send notifications, open host tabs, or change focus or selection. Task changes, manual refresh, and connection changes SHALL invalidate affected reuse. Older in-flight results SHALL NOT re-establish data invalidated after their request began. Retained snapshots SHALL NOT prove a task was deleted or no longer belongs in the visible list.

#### Scenario: A task changes after it was warmed
- **WHEN** a live invalidation reports a task change and the user selects a retained preview
- **THEN** Tasks revalidates the preview and displays the successful current result
- **AND** a result from before that invalidation cannot replace it

#### Scenario: Many tasks are scanned
- **WHEN** the user scans more tasks than the preview capacity
- **THEN** unneeded entries are evicted within the documented capacity
- **AND** speculative work remains within its concurrency limit and does not become a fetch of the whole tracker

#### Scenario: Filters hide a prefetched task
- **WHEN** filters, expansion, or scope produce a new settled visible order
- **THEN** subsequent speculation uses only that order
- **AND** completing a previous speculative read cannot select a hidden task

### Requirement: Secondary task content does not block basic browsing
Ordinary preview selection SHALL NOT fetch the complete dependency candidate catalog before a dependency picker opens. Existing blocker and blocked-task entries SHALL remain visible and usable. Loading activity attachments SHALL use a number of frontend requests that does not grow by one request per comment. Activity content outside the visible preview SHALL NOT require rich-text editor initialization before the heading and description can be presented. Deferred content SHALL remain reachable by scrolling, keyboard access, and the existing explicit comment-focus action.

#### Scenario: Browse without adding a dependency
- **WHEN** the user selects several tasks without opening either dependency picker
- **THEN** Tasks shows their existing dependency links
- **AND** it issues no complete-catalog read for those unopened pickers

#### Scenario: Open a dependency picker
- **WHEN** the user opens Add blocker or Add blocked task
- **THEN** eligible tasks from all tracker projects can load with an explicit loading, empty, or retryable error state
- **AND** existing self-link, duplicate-link, and cycle rules remain unchanged

#### Scenario: Load many comments with attachments
- **WHEN** activity contains multiple human and agent comments with attachments
- **THEN** each comment shows only its own attachment metadata
- **AND** the attachment-loading request count is independent of the number of comments
- **AND** a metadata failure is shown as a failure rather than as confirmed absence of attachments

#### Scenario: Focus an initially deferred composer
- **WHEN** the user invokes the existing comment-focus action before activity has entered view
- **THEN** the composer becomes available and receives the intended focus
- **AND** no draft is submitted or copied to another task

### Requirement: Performance changes preserve the edit and host contracts
Selection, scope changes, and safe removal SHALL retain the current pending-edit barrier. Failed saves SHALL leave the originating task, draft, and retry controls available. Draft ownership SHALL remain task-specific. Native Ticket tab closure, parking, reopening, and responsive host layout changes SHALL NOT discard an edit session. Existing input, composition, overlay, modifier, and outside-pane keyboard guards SHALL remain effective. Preview reads SHALL NOT replace current thread or pull-request lifecycle checks with fresh-looking cached claims.

#### Scenario: Save fails while a cached destination is available
- **WHEN** A has a pending description edit, B is cached, and saving A fails during a request to select B
- **THEN** A remains the accepted selection with its draft and retry controls
- **AND** the availability of B's cache does not bypass the save barrier

#### Scenario: Ticket pane is hidden and reopened
- **WHEN** the user closes or switches away from the native Ticket tab and later reopens it
- **THEN** the same accepted task and task-owned drafts remain available for the mounted Tasks session
- **AND** prefetch completion did not reopen the tab or steal focus

#### Scenario: Type a navigation letter
- **WHEN** keyboard focus belongs to an editor or an open overlay
- **THEN** navigation shortcuts do not replace the selected task
