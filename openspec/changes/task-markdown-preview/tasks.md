# Tasks

Acceptance conditions remain in [the attachment spec](specs/task-markdown-preview/spec.md) and [shared-document spec](specs/shared-markdown-document/spec.md); technical decisions remain in [design.md](design.md). Preserve authentication, ID-only loading, exact source, original downloads, source confinement and default-deny destinations. The actual file reader remains a separate consumer, not a substitute reader to build in this change.

Each delivery includes its tests and documentation. Before acceptance, the owner checks completion evidence and applicable project validation and clean-context review requirements for code changes. Each delivery runs its public-interface, transport or rendered integration tests, relevant typechecks, lint, public-SDK checks and builds. UI deliveries include an early working preview and real-browser keyboard, focus and compact-layout checks before final acceptance. Record unavailable checks as blocked, not passes. No mandatory test-first order is imposed.

The change owner updates these checkboxes manually after checking completion evidence. This checklist does not grant implementation authority. Installed-source/enabled-state changes and owned live test records require separate explicit approval. Preserve the separate file-reader plan and its completion evidence; absent production-reader integration stays open.

## 1. Read task Markdown attachments in a dialog

- [ ] 1.1 Deliver the private packages/markdown-document package with compiled ESM/type/CSS exports, per-package scripts, lockfile, consumer-owned React peer and planned GFM/highlighting dependencies; verify clean npm ci, public-interface tests, typecheck and build without raw-HTML/MDX execution dependencies or another React runtime.
- [ ] 1.2 Connect Tasks through a local build-time dependency and affected CI setup; verify a clean shared-package build followed by Tasks npm ci, typecheck and plugin build includes common code/CSS, and Node 24 clean-checkout CI runs the shared tests and fails when they fail without changing unrelated jobs.
- [ ] 1.3 Render baseline Markdown/GFM and exact Raw through the common interface with scoped spacious document styling; verify public fixtures preserve frontmatter, BOM, line endings and code whitespace, reject active HTML/scripts/MDX, and leave unsafe or not-yet-supported destinations inactive without guessing a source.
- [ ] 1.4 Add the authenticated saved-ID preview route with strict UTF-8 and binary-control validation; verify registered-route tests cover case-insensitive extensions, generic MIME, missing metadata/blob, auth denial, empty text, invalid text and exact BOM/CRLF preservation, with bounded errors and no filesystem paths.
- [ ] 1.5 Enforce actual-size checks and a bounded read before decoding/parsing; verify exactly 1 MiB succeeds, one byte above fails, and understated metadata or a size change during reading cannot bypass the cap.
- [ ] 1.6 Preserve upload, original download bytes/filename/disposition, image preview, removal and CLI behavior; verify existing regressions and downloads above the preview cap but below the existing upload limit.
- [ ] 1.7 Mount one task-scoped preview owner and connect saved task cards through the shared eligibility rule; verify rendered tests cover md/markdown case variants, generic MIME, non-Markdown downloads and misleading image extensions without changing image/removal actions.
- [ ] 1.8 Provide accessible filename title, Preview/Raw/Download/Close and loading/empty/unsupported/error/Retry states using the shared module and vendored responsive Dialog; verify initial Preview, one immutable snapshot, exact Raw, unchanged download identity and no refetch/write on view changes.
- [ ] 1.9 Abort reads and guard sequence/identity on close, replacement, retry, task change, unmount and confirmed active removal; verify delayed-response tests never reopen closed previews, overwrite a newer snapshot or display another attachment's content.
- [ ] 1.10 Preserve modal keyboard focus, task-shortcut isolation, Escape/Close and connected-trigger focus return with stable-task fallback; verify rendered tests and browser checks in desktop/compact presentations, with no task navigation, editor remount or workflow mutation.
- [ ] 1.11 Document the package interface/build order, source-policy ownership, task workflow, filename rules, exact Preview/Raw, 1 MiB validation, separate preview/download limits and Download fallback; verify clean-build examples and documented controls/errors against public, route and UI tests.

## 2. Read comment attachments without losing task state

Complete delivery 1 before delivery 2.

- [ ] 2.1 Connect saved comment cards to the same task-scoped owner, loader and module, leaving staged unsaved attachments out of scope; verify shared extension/MIME rules and Preview/Raw/Download/error behavior, one dialog, and unchanged image/removal actions.
- [ ] 2.2 Exercise close, A-to-B replacement, retry, task change, unmount and confirmed removal through both card variants; verify late responses are rejected and Close/Escape returns to the invoking card or stable task control if removed.
- [ ] 2.3 Preserve underlying route, scroll, comment draft/editor and workflow state through open, view switches and close; verify task/comment integration tests show no remount or navigation.
- [ ] 2.4 Document saved-comment previews and lifecycle/focus behavior in Tasks operating documentation; verify instructions match rendered integration tests and do not advertise unsaved-attachment preview.

## 3. Navigate headings and follow safe document links

Complete delivery 1 before delivery 3.

- [ ] 3.1 Derive local heading IDs and optional outline from rendered headings, including duplicates, non-ASCII and inline formatting; verify public/rendered activation tests isolate concurrent readers and underlying task headings, omit empty outlines and support hiding or compact disclosure.
- [ ] 3.2 Dispatch destinations only through explicit file-root/host or rootless-attachment policies; verify malformed encodings, unsafe schemes, relative/absolute attachment paths and absent permissions cause no read, navigation or asset request while retaining readable labels/alt text.
- [ ] 3.3 Support local fragments, external HTTP(S) links through BB URL preferences and credential-free remote images; verify accessible anchor/modifier behavior, local navigation, image fit/alt/aspect ratio, readable broken-image content, no referrer or authenticated proxy and blocking of same-origin authenticated BB resources.
- [ ] 3.4 Document allowed links/images, inactive attachment-relative assets, source-policy separation and remote-image network behavior; verify every restriction maps to public-interface or rendered activation tests.

## 4. Read technical reports at compact and desktop widths

Complete delivery 1 before delivery 4.

- [ ] 4.1 Add bounded known-language highlighting with plain fallback for unknown languages and fences over 20 KiB; verify public fixtures at the boundary preserve exact text, whitespace and JSON values without unbounded work.
- [ ] 4.2 Complete scoped host-token prose/outline/table/code layout using the design's measurements and document-container responsiveness; verify geometry/computed styles at 390 px and matched desktop widths, long filenames/lines, heading hierarchy, reachable controls and local wide-content scrolling without page overflow.
- [ ] 4.3 Preserve loaded text and view through live light/dark changes; verify custom-token fixtures, built-in body contrast of at least 4.5:1, visible keyboard focus and no global theme switch or Tasks editor/chat style leakage.
- [ ] 4.4 Record inspected generic-browser compact/desktop light/dark captures and document the verified layout, fence limits, responsiveness and accessibility; verify code-boundary, geometry, focus, keyboard and theme tests and report unavailable browser/reference evidence as blocked.

## 5. Connect the live-file reader to the shared renderer

Delivery 5 requires delivery 1 and a working production file reader with Preview and Raw views.

- [ ] 5.1 Confirm the actual markdown-reader source is available and coordinate common-module ownership before changing it; record integration scope or leave this delivery blocked without a substitute full reader or unapproved changes to the other plan.
- [ ] 5.2 Connect the production reader to the same package, stylesheet and destination-policy interface; verify its existing source-root/host confinement, source-safe destinations, refresh, line-range, exact Raw and bound Original fallback tests.
- [ ] 5.3 Run the same report through both production consumers at equivalent themes/content widths; verify common semantics/computed styles, consumer-local headings, intentional relative-link differences and independent operation without the other plugin installed, leaving this task open if the real reader is absent.
- [ ] 5.4 Add reader lockfile and affected CI dependency setup when its package exists; verify clean installs, typechecks and independently bundled common code/CSS with no sibling-checkout/runtime-plugin dependency or extra React runtime.
- [ ] 5.5 Document reader build order and source-policy ownership; verify examples preserve existing opener-selection, fallback, installation and preference limits without claiming missing later reader behavior complete.

## 6. Verify the complete attachment and file-reader experience

Complete deliveries 2, 3, 4 and 5 before delivery 6. The production file reader must also provide heading/source-line navigation, safe link/image handling and responsive code presentation before the assembled checks.

- [ ] 6.1 Run complete common-package and affected-plugin tests, typechecks, lint, bb plugin types . --check, clean-checkout CI and plugin builds; verify independent packaged code/CSS and record results separately.
- [ ] 6.2 Inspect real task/comment overlays with generic fixtures in light/dark at 390 px and desktop widths plus custom tokens, and compare matched-width production-reader reports; record reachable controls, focus/Escape, contrast, local overflow, draft/scroll preservation, shared styles, source-policy differences and no style leakage rather than treating static checks as visual evidence.
- [ ] 6.3 Complete the implementation workflow's single clean-context read-only review against the full feature diff, resolve blockers and rerun affected checks; verify the review record and do not claim absent production-reader integration complete.
- [ ] 6.4 Verify assembled operating documentation covers implemented controls, source policies, limits, clean builds, installation and rollback; separate fixture observations from installed-runtime evidence and retain missing-reader/browser/approval checks as blocked.
- [ ] 6.5 Obtain explicit approval before changing installed plugin sources/enabled state or creating owned live records; if approved, verify runtime build identity, real task/comment attachments, downloads, keyboard dismissal and shared-reader parity, perform scoped cleanup without overwriting concurrent changes, and report final installation/data state without automatic publication or preference changes.
