# Spec Delta

## Purpose

Let users understand attached-thread activity, archive state, and actionable pull request status directly in Tasks overview rows without confusing them with task workflow status.

## ADDED Requirements

### Requirement: Thread summary covers all attached threads
Each visible task list row with attached threads SHALL summarize every attachment, not just the latest or currently working thread. It SHALL distinguish starting, working, idle, failed, and removed threads with counts when multiple threads share a state. Archive state SHALL be reported separately from execution state: any archived attachments SHALL be identifiable, and a task whose existing attached threads are all archived SHALL explicitly communicate that fact. A failed thread SHALL remain visible in the summary even when another thread is working or archived. A task with no attached threads SHALL have no thread summary.

#### Scenario: Mixed activity
- **WHEN** a task has two working threads and one idle thread
- **THEN** the row communicates two working threads and one idle thread

#### Scenario: Failure alongside working threads
- **WHEN** a task has one failed thread and two working threads
- **THEN** the row communicates the failure as well as the working activity

#### Scenario: Mixed archive state
- **WHEN** one of a task's two idle threads is archived
- **THEN** the row identifies one archived thread without implying that both are archived

#### Scenario: All threads archived
- **WHEN** all existing attached threads are archived and one has failed
- **THEN** the row communicates that all are archived and that one failed

#### Scenario: Removed or unreadable thread
- **WHEN** an attached thread was deleted or its current information cannot be read
- **THEN** the row distinguishes a confirmed removed thread from unavailable information and does not infer archive state from either condition

### Requirement: PR summaries distinguish lifecycle and actionable details
A task row SHALL summarize the distinct PRs associated with its attached threads. Each PR SHALL retain its identity and lifecycle state: Draft, Open, Merged, or Closed. When usable rich details exist, the presentation SHALL distinguish failing checks, running checks, awaiting review, changes requested, conflicts, unresolved comments, branch behind, other merge blockers, and ready to merge. Multiple simultaneous conditions SHALL be available in the drill-down. A PR SHALL NOT be described as ready based solely on an Open state, absent data, a failed refresh, or unrecognized blocking or queue information.

#### Scenario: Failed checks and pending review
- **WHEN** a PR has failed checks and awaits review
- **THEN** the row shows the failing checks and its PR drill-down also exposes the pending review

#### Scenario: Lifecycle states
- **WHEN** attached threads refer to a draft, merged, or closed PR
- **THEN** the corresponding lifecycle state is shown without implying readiness to merge

#### Scenario: Ready PR
- **WHEN** usable rich details explicitly establish an open, non-draft PR with no blocking conditions or merge queue activity
- **THEN** the PR is described as ready to merge

#### Scenario: Unknown blocker or queue status
- **WHEN** PR metadata includes an unsupported blocker or merge queue condition
- **THEN** the row does not claim that the PR is ready to merge and communicates that its actionable details cannot be fully interpreted

### Requirement: Aggregation does not hide problems or double-count PRs
The row SHALL count a PR once by URL even when multiple attached threads refer to it. For multiple distinct PRs, the row SHALL show their total and an aggregate status that keeps known failing checks, requested changes, conflicts, or other problems visible. A merged PR SHALL NOT suppress a problem on another PR. Incomplete information SHALL be reflected in the aggregate rather than treated as success. Individual PR conditions SHALL remain available in the drill-down even when compact presentation collapses less urgent categories.

#### Scenario: Shared PR
- **WHEN** three attached threads share the same PR URL
- **THEN** the task row counts one PR and its drill-down connects that PR to the three threads

#### Scenario: Several PRs with mixed outcomes
- **WHEN** a task has three distinct PRs, one with failed checks, one awaiting review, and one merged
- **THEN** the summary reports three PRs and exposes the failure, pending review, and merged outcome without presenting the task's PR work as complete

#### Scenario: Partial lookup failure
- **WHEN** one PR is known to have merged and another attached thread's PR information is unavailable
- **THEN** the aggregate retains the known merged result and explicitly communicates the incomplete lookup

### Requirement: Missing and stale information is honest
The overview SHALL distinguish initial loading, confirmed no PR, basic lifecycle information without rich details, stale rich details, and unavailable information. An open or draft rich summary older than one hour SHALL NOT provide a current actionable claim; merged and closed summaries SHALL remain usable at any age unless superseded by newer contradictory information. A summary with a recorded refresh error SHALL NOT establish readiness. Without GitHub Insight, basic host PR information and thread navigation SHALL remain available, and the absence of rich details SHALL be explained. Archived threads SHALL follow the same freshness rules rather than being assumed complete.

#### Scenario: Stale open PR on archived thread
- **WHEN** an archived thread has an open PR summary last updated more than one hour ago
- **THEN** the overview labels the rich details as stale, retains any available PR link and basic lifecycle information, and does not claim ready to merge

#### Scenario: Old merged summary
- **WHEN** an attached thread has a valid merged PR summary older than one hour and no newer contradictory information
- **THEN** the overview still shows the merged state

#### Scenario: Optional integration absent
- **WHEN** GitHub Insight is absent or disabled and the host reports an open PR
- **THEN** the row shows the open PR and identifies its rich details as unavailable rather than inferring readiness

#### Scenario: Confirmed no PR versus loading
- **WHEN** completed lookups confirm that none of the attached threads has a PR
- **THEN** no PR summary is shown
- **AND** an unfinished lookup is not presented as confirmed absence

### Requirement: Summary interactions preserve task navigation
Thread and aggregate PR summaries SHALL offer a keyboard- and pointer-accessible drill-down listing individual identities and statuses. A single known PR SHALL have an accessible link to GitHub. Opening summaries, thread links, or PR links SHALL NOT also open the task. Clicking the rest of the row SHALL continue to open the task, and existing task editing, subtask expansion, and keyboard navigation SHALL remain available. Drill-down information SHALL NOT require hover.

#### Scenario: Open a thread from a summary
- **WHEN** a user opens the thread summary and activates one of its thread links
- **THEN** BB navigates to that thread without opening the task detail

#### Scenario: Open a PR
- **WHEN** a user activates an individual PR link
- **THEN** that PR opens without navigating to its task or thread

#### Scenario: Keyboard drill-down
- **WHEN** a keyboard user focuses and activates a summary
- **THEN** its drill-down opens, individual links are reachable, and dismissing it returns focus to the summary control

### Requirement: Status remains readable across task list layouts
The same summary behavior SHALL apply to top-level tasks and visible subtasks in All tasks, project lists, and the existing active-work list. Task status and title SHALL remain distinct from thread and PR status. At constrained widths, summaries SHALL wrap or collapse less urgent detail while keeping thread failures, PR problems, and archive information discoverable without horizontal scrolling. State SHALL be communicated in text as well as icons or color, using the active BB theme.

#### Scenario: Dense narrow row
- **WHEN** a narrow task row has subtasks, dependencies, labels, a due date, multiple thread states, and several PRs
- **THEN** the task title remains readable, summary controls remain reachable, and problem and archive information are not available only on hover

#### Scenario: Filtered subtask
- **WHEN** a matching subtask appears beneath a dimmed parent
- **THEN** the subtask has the same summary behavior as a top-level task and the parent keeps its existing contextual treatment

### Requirement: Enrichment is bounded and independent of task mutations
The overview SHALL enrich the currently displayed task rows through bounded batch requests, share lookups for repeated threads and environments, and avoid starting a GitHub detail request for every row. An individual lookup failure SHALL NOT prevent other rows from receiving status information. While the list is open, attachment and status changes SHALL become visible without reopening individual tasks; fallback refresh SHALL re-evaluate freshness at least once per minute. Reading or refreshing status SHALL NOT change task status, attachments, thread archive state, or external PR/review state.

#### Scenario: Shared environment across tasks
- **WHEN** several visible task rows attach threads using one environment
- **THEN** enrichment shares the environment PR lookup rather than issuing one lookup for each row

#### Scenario: Status updates while viewing the overview
- **WHEN** a thread is archived, resumes, fails, or receives an updated PR summary while the overview is open
- **THEN** the affected status updates by the next fallback refresh, within one minute after authoritative information is available

#### Scenario: Independent workflow status
- **WHEN** a task marked In Review has its threads archived and its PR merged
- **THEN** the row shows archived and merged states while the task remains In Review
