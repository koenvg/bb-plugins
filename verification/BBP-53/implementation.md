# Delivery 1 implementation record

Scope is tasks 1.1 through 1.11. The parent owns review, acceptance, and checklist updates. No installed plugin, live record, publication, or task-status writes are permitted.

## Decisions

Use candidate B's private request coordinator and discriminated React state. Graft candidate A's declarative confirmed successful attachment list and guarded focus return when no newer overlay exists. Request generation and focus-session identity are separate. Retry retains the focus session.

Named data shapes are DocumentView, DestinationPolicy, PreviewSnapshot, PreviewFault, and PreviewState. The shared package accepts source text, view, namespace, and an explicit deny-only destination policy. Tasks owns authentication, snapshot loading, request identity, dialog controls, and focus.

Model the Domain selects discriminated resource state instead of synchronized booleans. Sequence work into verifiable units selects package, route, UI, then integration and clean builds. Test Behavior, Not Implementation selects public rendered documents, registered HTTP routes, and actual task UI tests.

## Throughput checkpoint

The units are shared package, registered preview route, task-scoped UI with early generic browser capture, and integration/docs/clean builds. Each ends with checks before the next begins. No nested workflow agents run. The parent runs the independent review.

## Approved deviations and stale planning facts

The user approved frozen Bun installs instead of npm ci. Current versions are Bun 1.4.3, SDK 0.6.37, and Node 24.15.0. Markdown Reader exists and comments were removed. Neither is changed or restored here. Heading navigation, destination activation, remote images, and highlighting remain later scope. Planned highlighting dependencies are installed but unused.

## Evidence

Command logs and generic browser captures are recorded in this directory. Fake-host HTTP checks bypass authentication and cannot prove denial at the real host boundary.
