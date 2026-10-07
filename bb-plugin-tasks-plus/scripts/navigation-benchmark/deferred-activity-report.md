# BBP-67 deferred activity editors

## Source and scope

Implementation starts at `da0946e9732218d3343aa041a0ea54797196c027`.
Measurements use the BBP-67 working-tree changes from that commit. No installed
plugin source, tracker data, quota setting or user draft changed. Activity reads
still start independently of editor activation. This slice does not require a
change to their loader or attachment contract.

The section keeps its heading and a minimum-height placeholder. Scrolling into it
or activating `Show activity` mounts the complete existing feed. The `m` action
activates and then focuses and scrolls the correct composer. Keyed task changes
destroy editors, not task-owned draft records. See
[activation behavior](../../views/activity/README.md#editor-activation).

## Deterministic checks

- Before activation: one description editor and zero activity editors.
- After activation: 50 comment editors, one composer and ten file links.
- One activity read, with no per-comment attachment requests.
- Real editor construction, task replacement and destruction, A-to-B-to-A drafts,
  staged files, notification choice and zero selection side effects are tested.
- Pending-read composer access, canceled old-task focus, manual activation without
  an observer, observer cleanup and native pane parking/reopening are tested.
- Existing read failure/retry, input, overlay, keyboard and attachment tests remain
  in the full Tasks suite. Tests that use the composer now activate it explicitly.

## Separate local costs

Node v24.15.0 on macOS arm64, Apple M5. The SDK test host uses in-memory SQLite,
50 alternating human/agent comments and ten text attachment metadata records from
BBP-60's fixture. Five frontend mounts run separately from 30 API pairs.
The initial checkpoint ends with the description editor present and no activity
editors. The second starts at explicit activation and ends after the complete
feed, composer and links exist. No automated wall-clock threshold is used.

| Operation                     | Samples | Median ms | p95 ms | Worst ms |
| ----------------------------- | ------: | --------: | -----: | -------: |
| Initial preview in jsdom      |       5 |      9.92 | 120.30 |   120.30 |
| Activated feed in jsdom       |       5 |    252.04 | 379.00 |   379.00 |
| Activity RPC and schema parse |      30 |      0.31 |   0.41 |     0.57 |

[Raw local sample](deferred-activity-local.json) includes counts, environment and
method. These numbers include test work and omit real network/provider latency.
The five-sample p95 is the maximum, not a stable latency estimate. The initial
preview does not wait for the activity read to complete.

Rerun from the repository root:

```sh
BBP67_ACTIVITY_REPORT=/tmp/bbp67-activity-heavy.json \
  npm --prefix bb-plugin-tasks-plus test -- scripts/navigation-benchmark/activity-read.test.tsx
npm --prefix bb-plugin-tasks-plus test -- views/activity/deferred-activity.test.tsx
```

## Isolated browser inspection

An owned browser tab used a temporary Vite preview of the changed source with
real Tiptap editors, a native overflow pane and IntersectionObserver. RPC results
came from an offline fixture, not a live tracker. The preview used development
React and reduced CSS. It is not the native BB application or the quota integration.
The browser was Chrome 153 on the same machine, at 1440 x 900 with CPU throttling
rate 1. Five task replacements measured two animation frames after matching DOM.
The separate feed checkpoint started at scroll and ended with all 50 comment
editors, the composer and ten links present.

| Browser preview operation                    | Samples | Median ms | p95 ms | Worst ms |
| -------------------------------------------- | ------: | --------: | -----: | -------: |
| Initial description presentation opportunity |       5 |     49.90 |  50.00 |    50.00 |
| Scrolled complete-feed opportunity           |       5 |     66.70 |  75.20 |    75.20 |

[Raw browser sample](deferred-activity-browser.json) records all samples and the
browser version. The section's offset stayed exactly 1212.921875 px before and
after activation in all five samples. Initial activity editor count was zero;
activated count was 51, with all ten links. Separate manual inspection confirmed
that comment focus both selects the composer and scrolls it into the pane.
The first hidden-tab attempt supplied no frames or observer delivery. It was not
counted. The recorded run used a visible owned tab. No physical-paint trace was
captured and no before/after speed claim is made.

## Remaining host gates

Installed native Ticket measurements, both-plugin presentation traces, the warm
navigation budget and installed compact/overlay checks remain unrun. Activation
of this worktree as the installed Tasks source needs explicit approval. Do not
reuse either local table as evidence for the 100 ms host-navigation requirement.
Use the approved protocol in [the paired baseline](paired-baseline-report.md),
measure initial preview and scrolled feed separately, and record current source
and bundle identities. Do not edit live task data or replace quota for this check.
