# Design

## Context

See proposal.md for motivation. GitHub Insight registers a thread-only banner in app.tsx. ui/composer-banner.tsx renders nothing unless insight is available and bannerParts returns content. app.test.tsx already exercises these states and PR-panel navigation through the SDK test harness.

Inspection of the installed BB bundle showed a separate native PR anchor with an accessible label beginning `Pull request ` inside the `Thread context before sending` region. File controls and merge/mark-ready actions are siblings, not children of that anchor. The documented composer customization API adds banners but exposes no native-badge visibility option. These DOM details are observations, not a supported SDK contract.

## Goals / Non-Goals

**Goals:** Keep the workaround local, reversible, and narrowly targeted; isolate each composer in split views.

**Non-Goals:** Modifying BB core, hiding the whole native row, suppressing PR links globally, changing insight fetching, or introducing a general DOM customization framework.

## Decisions

1. Add a plugin-owned marker only to the rendered custom banner. Use a scoped CSS rule that requires that marker within the same composer and targets only the native PR anchor inside the native context region. Prefer structural and accessible attributes over generated class names, positional selectors, or PR URL matching alone. Confirm the smallest shared composer boundary in the installed UI before fixing the selector; do not use a document-wide `:has()` condition.
2. Keep styling owned by the plugin/banner lifecycle. A marker-gated rule becomes inert when the banner disappears; any injected style must be removed on disposal. Prefer declarative CSS over observers, DOM removal, or rewriting native components.
3. Suppress only while replacement content is visible. This assumption preserves native status during loading, errors, ready-to-merge states, or other cases where the current banner returns null. Hiding whenever the plugin is installed would remove useful status with no replacement.
4. Test the actual production selector against a representative host DOM fixture, including two composers and unrelated PR links. Retain SDK-rendered banner tests for availability and navigation. Confirm real CSS rendering and interactions in the live UI at normal and compact widths; jsdom alone does not prove layout or browser selector behavior.

## Risks / Trade-offs

- [BB markup or accessible labels change] → Require the narrow known structure, leave UI visible on mismatch, document compatibility assumptions, and avoid fallback selectors that hide larger containers.
- [Shared ancestor accidentally includes several panes] → Verify the exact composer boundary and test simultaneous panes before shipping.
- [CSS tests pass but browser layout regresses] → Inspect live screenshots and exercise file and PR controls, not just selector matches.
- [No supported override exists] → Treat this as temporary; replace it with a BB setting/SDK option when available.

## Migration Plan

No data migration. Build and validate the plugin, then reload through the normal local plugin workflow for live verification. Roll back by removing the isolated rule and banner marker or disabling GitHub Insight. No installed BB bundle edits are permitted.
