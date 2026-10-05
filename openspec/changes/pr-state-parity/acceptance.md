# Acceptance record

## Build under test

- Change: `pr-state-parity` in `bb-plugin-github-insight`.
- Baseline: `9fd87e4ef4607b8bbe9430ebd82ff3f91fa4d8db`. The checks below ran on the working-tree implementation before its PR commit.
- Implementation commit: `b9dc379`. The follow-up PR commit adds only acceptance evidence and task metadata; the installed executable build is unchanged.
- Plugin version: `0.1.0`. Built with BB `0.44.0` and Plugin SDK `0.5.29`.
- `dist/app.js` SHA-256: `3a558b3b9d7e64b484413ec68e0bf27d0196415c6fd8e1575232c07d488f665a`.
- `dist/app.css` SHA-256: `4ab908a5ad660f2344cbfd81438eb5280b0cfe2930b29cd186fc6a6e6340a16d`.
- The user approved replacing the installed plugin for live host checks. The final build is installed from a stable copy outside the worktree. Draft PR #92 was created at the user's request before the final host check. No Mark ready, merge, or enqueue action was used during checks. The prior source remains untouched and is available for rollback.

## Checks passed

From `bb-plugin-github-insight`:

- `npm test`: 60 files, 956 tests passed. This includes presentation, queue parsing, summaries, shared merge progress, confirmation, write deduplication, head guards, palette feedback, and navigation.
- `npm run typecheck`: passed.
- `npm run build`: passed.
- `git diff --check`: passed after removing trailing blank lines from the replaced banner decision and its tests.
- `openspec validate pr-state-parity --strict`: passed.

The initial availability tests failed for the missing loading, retry, and last-good handling. They pass after implementation. Earlier failures for hidden-state and queue-label assertions were updated to the new contract. The cross-plugin navigation test required installing the existing lockfile dependencies of `bb-plugin-pr-thread-list`; no dependency manifest or lockfile changed.

## Completion review

The single fresh-context read-only reviewer returned **request changes** with two P2 findings. Both were fixed after the review; no second reviewer was run.

- Moved the paired lifecycle/queue suite from `app.test.tsx` to `ui/pr-status-rendered.test.tsx`. The files now have 988 and 104 lines, respectively. All 11 moved cases still pass.
- Added `mergeQueue` to palette feedback invalidation. Two new rendered regression cases first reproduced the stale queue message, then passed after the fix. They cover failed-to-merging and position-only updates without a new PR head, action, blocker, error, or timestamp. Both views converge; no merge write or confirmation occurs.
- Reran the complete 956-test suite, typecheck, build, diff check, and strict OpenSpec validation after the fixes. No RPC, backend, polling, dependency, summary, or native-suppression changes were added.
- Review run: `aedb4607-f395-4b9e-b637-92db34f67d76`. Baseline is the commit recorded above.

## Browser fixture checks

The user approved an isolated local headless browser after the default Browser Use connection failed with `cdp_disconnected`.

The browser receipts and screenshots below predate the completion-review fixes. Their `dist/app.js` SHA-256 was `469fa88e9b9709d1f44c73cc970225ae9b6bc265c3217ff42ae5ff8cea05f8cb`. The final build hash is recorded above. The CSS hash is unchanged. These fixes moved tests and cleared obsolete palette feedback; they did not change layout or status rendering. The final feedback behavior was verified with rendered-component tests, not a second browser run.

- Browser host: `host_dt6w76k4w8`.
- Session: `3132b130-da7f-44b7-8b13-60d5f5930c25`.
- Preview used the real `ComposerBanner` and `PrTab` source modules, the generated plugin CSS, a fixture RPC/realtime/navigation runtime, representative light/dark token values, and a host-like base reset. It was not the live BB host composer.
- [Matrix receipt](evidence/browser-matrix.json): 48 cases passed. Twelve states at 1200px and 390px in light and dark themes. Covered Draft, blocked Draft, actionless Open, Closed, Merged, ready Open, all four queue states, read failure, and confirmed no-PR.
- Lifecycle text fit inside the banner in every matrix case. Long detail truncated first. No horizontal banner overflow was observed.
- [Interaction receipt](evidence/browser-evidence.json): Enter activated known-PR status and the fixture panel opener once. Enter on Retry recovered the banner after a transport failure. Both views showed initial loading during a delayed read.
- Both views retained Draft, the transport error, and the original refresh time after a failed reload. The fixture's fixed 2024 timestamp is deliberate old data, not the date of this check.
- The browser fixture write counter remained zero.

Screenshots were inspected after adding the missing base reset to the preview. The first evidence script also had a selector failure when an active button added an accessibility-tree marker; the corrected script passed. Those fixture failures were not accepted as UI evidence.

- [Draft, light, normal width](evidence/draft-light-normal.jpg)
- [Queue failure, dark, normal width](evidence/queue-failed-dark-normal.jpg)
- [Blocked Draft, light, compact width](evidence/draft-blocked-light-compact.jpg)
- [Stale Draft, dark, compact width](evidence/draft-stale-dark-compact.jpg)

## Installed host checks

[Initial host acceptance receipt](evidence/host-acceptance.json) records the checks before PR creation. [Final Draft host matrix](evidence/host-draft-matrix.json) records the follow-up after the user requested Draft PR #92.

- The approved install moved plugin `github-insight` from `/Users/koen/workspace/bb-plugins/bb-plugin-github-insight` to `/Users/koen/.bb/local-plugins/github-insight-pr-state-parity.ToPKlb`. This is a complete package/dependency copy, not a reference to a disposable worktree.
- `bb plugin list` reports `running`, a compatible frontend, and running `pr-poller` and `review-queue` services. Frontend asset generation: `cc69b1134dd5d746`. The installed files and served JavaScript match the final build hashes above.
- Backup: `/tmp/pr-state-parity-install.4HDisW/package-before.tgz`, with `source-before.json` and `plugin-before.json`. The original source directory was not edited. Rollback, if needed: `bb plugin install path:/Users/koen/workspace/bb-plugins/bb-plugin-github-insight --yes`. This keeps the same plugin identity and configuration; do not remove the plugin first.
- Browser: existing Arc, verified as the listener on port 9222. Dedicated Browser Use daemon: `pr-parity-arc-kh5e9-verify`. Owned tab: `4FCF1A221DCD77D31391C28DCDFFF631`, now closed. Checked the current thread in the real BB web host, not the fixture.
- Real Changed files control was visible and enabled at 1615px and 390px. Activating it opened the actual file list. Activating its README row opened the actual Diff panel at both widths. [Normal-width capture](evidence/host-changed-files-normal.jpg) and [compact capture](evidence/host-changed-files-compact.jpg) show the light-theme controls. The file count increased as evidence files were added.
- These live functional activations used the real DOM buttons' `click()` handlers. Background Arc pointer/key attempts did not produce a verified UI result and are not counted as keyboard acceptance. The fixture keyboard checks remain recorded separately.
- Two inspection scripts had selector-string quoting errors and were rerun with corrected quoting. An initial broad Mark ready text match also matched tool transcript buttons; it was discarded. The initial exact button-name check found no offered Mark ready control on the no-PR thread. The later check below uses the user-requested Draft PR. None of these inspection failures is presented as accepted UI evidence.
- After the user requested PR creation, Draft PR #92 linked to this thread through normal host detection. The final build showed Draft with empty blockers beside the host's Changed files and Mark ready controls in four real-host cases: 1615px and 390px, each in light and dark themes. Each control fit the viewport, was enabled, and passed a hit-target check. Mark ready also appeared as a button in the accessibility tree. It was not activated.
- Final captures: [light normal](evidence/host-draft-light-normal.jpg), [dark normal](evidence/host-draft-dark-normal.jpg), [light compact](evidence/host-draft-light-compact.jpg), and [dark compact](evidence/host-draft-dark-compact.jpg). All four were inspected. File counts changed as the evidence files were added.
- The first final-matrix attempt ran before Draft had remounted after resize and failed. The accepted matrix waits for the Draft button. An earlier very narrow split-pane composer also hid Mark ready in the host's tiny-control group; the final normal-width cases use the composer with that panel closed. This does not establish a native-suppression defect, and no suppression CSS was changed.
- Second owned Arc tab: `FB8B512B3703EA55994B26A400490861`, now closed. Media, device, and focus overrides were cleared before closing it. No Mark ready, merge, enqueue, or PR-link write was used.

## Acceptance limits

- All 15 OpenSpec tasks are complete. Task 4.3's previously missing offered Mark ready check passed after the user-requested creation of Draft PR #92.
- Mark ready visibility, enabled state, hit target, and accessibility presence were checked, not its write operation. Live pointer/keyboard activation remains unverified; fixture status/Retry keyboard checks passed. The final live light/dark captures prove presence and layout, not dark-theme Changed files activation. Those activation checks ran in light mode.
- Native badge suppression remains owned by BBP-113 and `hide-native-pr-badge`. Its CSS was not changed. No new runtime suppression failure is claimed from these fixture checks.
- Native desktop checks were skipped because they were not requested. Browser evidence does not prove native desktop behavior.

## Cleanup

The headless fixture session was closed after its receipts and four final captures were copied here. Its temporary Vite server was stopped. Temporary preview sources and logs remain at `/tmp/pr-state-parity.UAKuLS` for debugging; they are not installed or part of the package build.

Both task-created Arc tabs were also closed. Their media, device, and focus overrides were cleared first. Existing tabs, cookies, and logins were preserved. The approved final plugin build remains installed from the stable copy recorded above. The old source and backup were retained; no rollback was needed.
