# Markdown Reader

Users open read-only Markdown, navigate its headings/lines, refresh a snapshot and add selected excerpts to an associated draft.

## Sub-features

- reader-views: Preview/Raw, exact text and no extra view-switch reads.
- reader-navigation: outline, fragments, footnotes and host line-range requests.
- reader-refresh: explicit reread, stale retention, Retry and bound fallback.
- reader-selection: source references, draft preservation, keyboard activation and zero sends.

## How to get to it (user POV)

- Choose Markdown Reader with BB's one-off Open with for live workspace, absolute-host or thread-storage .md/.markdown files.
- The persistent File openers preference is a separate approved entry.
- Choose Preview/Raw/Outline/Refresh or select text and activate Add to chat.

## Driving it with BB and package harnesses

Preconditions:

- Follow [shared Launch and Doctor](../SKILL.md), then this package's [README](../../../../bb-plugin-markdown-reader/README.md). Use the new evidence directory and resolved package/instance/host IDs. Local checks do not install the plugin.
- Installed actions follow [the installed workflow](../references/installed-workflow.md), with exact-checkout identity, needed permissions and an owned record/state ledger. Missing prerequisites remain blockers.

Read the maintained subfeature maps: [document views](document-views.md), [navigation](navigation.md), [refresh](refresh.md), and [selection](selection.md). After setup, `"$SKILL/scripts/verify.sh" "$EVIDENCE/markdown-smoke"` proves one complete local Preview → Raw → Preview path. `"$SKILL/scripts/browser.sh" markdown-reader "$EVIDENCE/browser"` runs its existing browser suites with retained traces and isolated output. The smoke Doctor checks actual PID, listener and checkout; exact Raw source, read count and unchanged fixture hash are observed. Installed opening/source/line requests and live composer checks still require the installed workflow and owned records.

For common-renderer or two-consumer changes, also follow [shared Markdown verification](../references/shared-markdown.md). It provides fresh independent builds and a matched-width report comparison without installing either plugin.
## Gotchas

- Use the subfeature maps instead of inferring all entries from the root fixture.
- Simulated host reads and SDK composer are existing external boundaries, not installed acceptance.
- Do not change a persistent opener default for a one-off reading proof.
- The local smoke is not a test of any other plugin.
- A previous package-local playwright-report can make the SDK import audit scan generated trace modules and fail. This was reproduced and recorded as [BBP-233](bbtask://BBP-233). Keep the original failure; only move a report out of source after establishing ownership, preserve it as evidence, and restore it without overwriting concurrent output. Do not suppress real import violations. The shared browser wrapper writes new reports outside the package.
