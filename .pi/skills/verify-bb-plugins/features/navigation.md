# Heading and line navigation

Users navigate a document with Outline, same-document links and footnotes. A BB line-range opening request reveals source lines in Raw.

## Sub-features

- `navigation-outline`: Outline toggle and wide aside or narrow On this page disclosure.
- `navigation-fragments`: repeated and Unicode headings have separate focus/scroll targets.
- `navigation-footnotes`: references and returns stay reader-local.
- `navigation-lines`: valid host line ranges reveal exact source lines without fetching again.

## How to get to it (user POV)

- Choose **Outline**. In a narrow panel expand **On this page**, then choose a heading.
- Follow a same-document heading link or a footnote reference/return inside Preview.
- Open a supported Markdown file at a line range through BB's native file-opening path. This entry switches to Raw; it is not a user-created fixture event.
- The controlled navigation document opens at `/?document=navigation&width=760&theme=light`.

## Driving it with Playwright

Preconditions:

- Setup passes. Use a new `SUITE_EVIDENCE` per the index.
- Installed line-opening acceptance needs a real BB host, owned file and native entry request.

- **Outline and fragment entries.** Run `bun run --cwd bb-plugin-markdown-reader test:browser navigation.spec.ts --trace on --output "$SUITE_EVIDENCE/tests"`. The suite activates the On this page summary by Enter at narrow widths, then the second button named `日本語 code link` inside the outline. The matching heading must become active and visible within this reader. It also activates `Second Japanese heading` and checks there is still one page and no document hash navigation.
- **Line requests.** The same suite supplies a public host-prop request for line 18 and checks `Raw Markdown`, `[data-source-line="18"]`, and `[data-highlighted="true"]`. This is boundary input, not native BB opening proof. Exact text, focus and reader-local visibility establish the component result.
- **Footnotes and repeated readers.** The same file includes footnote and isolation cases. Read its named cases before narrowing the command; a single width does not cover the full feature.
- **Native line path.** Follow the installed workflow, open an owned Markdown file at a known range through BB, and capture the initiating entry and exact highlighted lines. Retain host/file identity and verify that navigation does not change file bytes.

## Gotchas

- The layout switches at actual reader width, not browser width. Above 1080 pixels it uses an aside; narrower readers use a closed disclosure.
- Duplicate visible headings require reader-local scope and the correct occurrence.
- Malformed or unknown fragments remain inert. Cross-file fragments are not heading-navigation acceptance.
- Synthetic host events prove only component handling of public props.
