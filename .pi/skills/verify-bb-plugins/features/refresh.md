# Refresh and read recovery

Refresh rereads the source. A failed refresh keeps the old content but marks it stale; Retry reads again, and Open in BB preview uses the already bound fallback.

## Sub-features

- `refresh-success`: a successful reread updates both views.
- `refresh-stale`: failed Refresh retains and clearly labels the old snapshot.
- `refresh-retry`: Retry rereads without hiding an unresolved failure.
- `refresh-original`: bound BB preview is offered on failed/unsupported reads.

## How to get to it (user POV)

- In Preview or Raw choose **Refresh** after the source changes.
- When an error is shown, choose **Retry** or **Open in BB preview**.
- The deterministic failure preview opens at `/?width=760&theme=light&refresh=error`.

## Driving it with Playwright

Preconditions:

- Setup passes and `SUITE_EVIDENCE` is fresh.
- A live successful-refresh check needs an approved owned Markdown file that the run may modify and restore.

- **Failure and Retry.** Run `bun run --cwd bb-plugin-markdown-reader test:browser refresh.spec.ts --trace on --output "$SUITE_EVIDENCE/tests"`. The test clicks `Refresh`, waits for `Refresh failed. Showing stale snapshot.`, compares retained Preview text, switches to `Raw`, and clicks `Retry`. The alert must persist and exact Raw text must remain unchanged.
- **Bound fallback.** The same test clicks `Open in BB preview` and observes `Bound BB preview placeholder. No plugin selection occurs.`. That proves the component selects its bound Original, not native BB rendering or opener re-entry.
- **Successful reread.** For installed acceptance, record the owned file hash, change only that file's text through an approved file write, activate `Refresh`, and verify the new content in Preview and Raw. Observe the real read and source hash. Restore only if current content still matches what this run wrote.
- **Initial failure and unsupported sources.** Follow the installed workflow using approved unreadable or unsupported owned inputs. Capture the failed read, error, Retry action and bound native fallback. The refresh-failure fixture does not prove every initial-read rejection.

## Gotchas

- No automatic file watcher exists. Switching views is not a reread.
- Retained content is readable but is not verified current after failure.
- The fixture deliberately fails every read after the first in error mode. It cannot prove recovery success.
- A production successful Retry must clear the stale label only after a successful read.
