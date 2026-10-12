## MODIFIED Requirements

### Requirement: Comments are in page order

The Review tab SHALL put its comments in one list, in the order they show on the page: older comment drafts first, then outdated threads, then the comments of each file in file order. In a file, comments SHALL be sorted by line, old side before new side on the same line, and review threads before comment drafts on the same line and side. A comment is a comment draft or a review thread that is not resolved. When "Show resolved" is on, resolved threads SHALL also be in the list. A resolved thread that shows because it has a new comment SHALL also be in the list.

#### Scenario: Drafts and threads in one order

- **WHEN** file `a.ts` has an open thread on line 40 and a comment draft on line 12, file `b.ts` has an open thread on line 7, and there is one outdated thread
- **THEN** the order is: the outdated thread, the `a.ts` draft on line 12, the `a.ts` thread on line 40, the `b.ts` thread on line 7

#### Scenario: Resolved threads follow the switch

- **WHEN** a file has one open thread and one resolved thread, and "Show resolved" is off
- **THEN** the list has only the open thread
- **WHEN** the user turns "Show resolved" on
- **THEN** the list has both threads

#### Scenario: Resolved thread with a new comment

- **WHEN** a file has one open thread and one resolved thread with a new comment, and "Show resolved" is off
- **THEN** the list has both threads
