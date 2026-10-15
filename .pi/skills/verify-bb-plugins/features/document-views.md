# Document views

Users read formatted Markdown in Preview or inspect the complete original source in Raw. Neither view edits the file.

## Sub-features

- `views-preview`: readable headings, code, tables, disabled task lists and passive document HTML.
- `views-raw`: complete exact text, including leading frontmatter and whitespace.
- `views-switch`: keyboard and pointer activation preserve one snapshot without another read.
- `views-native-open`: BB's one-off opener choice and saved opener preference reach the reader for supported sources.

## How to get to it (user POV)

- Open a live workspace, absolute-host or thread-storage `.md` or `.markdown` file in BB, then select Markdown Reader with the one-off **Open with** choice.
- A user can also select it under **File openers**. Verification uses the one-off choice unless changing that persistent preference has separate approval.
- The isolated preview opens directly at `/?width=760&theme=light`; choose **Raw** or **Preview**.

## Driving it with Playwright

Preconditions:

- Launch and Doctor pass. The fixture heading is `Reading a workspace document`.
- Native paths require approved owned files and exact-checkout activation; fixture-only proof leaves those entries unverified.

- **Preview → Raw → Preview.** From repo root run `"$SKILL/scripts/verify.sh" "$EVIDENCE/markdown-smoke"` as defined in Launch. The helper opens the fixture, captures Preview, focuses the role-button named `Raw` and presses Enter, then compares the element labelled `Raw Markdown` with `tests/fixtures/report.md`. It captures Raw, activates `Preview` by keyboard, and captures the restored heading. Success requires one read across both switches and an unchanged source SHA256.
- **Responsive and theme cases.** Run `bun run --cwd bb-plugin-markdown-reader test:browser reader.spec.ts --trace on --output "$SUITE_EVIDENCE/tests"`. Three existing cases cover 760-light, 390-dark and 1440-custom. Structured assertions prove exact Raw content, bounded local overflow, keyboard focus, and no fallback in a ready reader.
- **Broader presentation.** Run `bun run --cwd bb-plugin-markdown-reader test:browser presentation.spec.ts --trace on --output "$SUITE_EVIDENCE/tests"`. The existing matrix covers narrow and wide reader widths, live tokens, passive code, table/image containment, and footnote/list presentation.
- **Native entries.** Follow the installed workflow for each source and each requested opening path. Capture the opener action, reader path identity, displayed content, and unchanged file hash. Saving a preference is not implied by an Open with test.

## Gotchas

- Raw is not an editor. View switching does not Refresh.
- Frontmatter is hidden only in Preview. Raw includes it.
- Production file extension and source routing are outside the direct-render fixture.
- Screenshots alone do not establish exact whitespace or read-only behavior.
