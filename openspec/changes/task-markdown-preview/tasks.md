# Tasks

## 1. Shared package and build contract

- [ ] 1.1 Create the private `packages/markdown-document/` package with compiled ESM/type/CSS exports, per-package scripts, a lockfile, React peer ownership, and the planned GFM/highlighting dependencies; verify clean `npm ci`, initial tests, typecheck, and package build succeed without raw-HTML/MDX execution dependencies.
- [ ] 1.2 Add the Tasks build-time dependency and lockfile integration; verify a clean shared-package build followed by Tasks `npm ci`, typecheck, and `bb plugin build` resolves the package and includes its code/CSS without bundling another React runtime.
- [ ] 1.3 Document the shared package interface, source-policy responsibilities, and build order in its README; verify the documented clean-checkout commands work and the public exports match the examples.

## 2. Shared document behavior

- [ ] 2.1 Add test-first public-interface fixtures for common Markdown/GFM semantics, frontmatter/source preservation, HTML/script rejection, exact code whitespace, unknown languages, and the 20 KiB fence boundary; observe the missing-behavior failures, implement parsing/rendering/Raw and bounded highlighting, then verify all fixtures pass.
- [ ] 2.2 Add test-first heading/outline cases for duplicate, non-ASCII, and inline-formatted headings, local fragments, concurrent readers, and underlying task headings; implement shared heading IDs/outline navigation and verify every activation targets only its own document.
- [ ] 2.3 Add test-first destination-policy cases for confined file sources and rootless attachments, unsafe schemes, malformed encodings, relative/absolute paths, remote images, and authenticated same-origin BB resources; implement default-deny dispatch and verify rejected destinations make no read/navigation/asset request.
- [ ] 2.4 Implement scoped theme-token CSS and container-responsive prose/outline/table/code layout using the reader design's measurements; verify computed-style/geometry checks at 390 px and matched desktop content widths, live theme changes, keyboard focus, and unchanged Tasks editor/chat styles.
- [ ] 2.5 Document supported Markdown, exact source behavior, fence limits, default-deny source policies, image network behavior, and CSS confinement; verify each documented restriction maps to a passing interface fixture.

## 3. Bounded attachment preview transport

- [ ] 3.1 Add red-green registered-route coverage in the Tasks attachment tests for supported extension case variants, generic MIME metadata, saved IDs, auth denial, missing metadata/blob, empty text, invalid UTF-8, BOM/CRLF preservation, and binary controls; implement the ID-based preview response and verify errors are bounded and contain no filesystem paths.
- [ ] 3.2 Add test-first byte-limit cases at exactly 1 MiB and one byte above it, understated metadata, and a size change during the read; implement actual-size checks plus a bounded read and verify oversized content never reaches decoding or Markdown parsing.
- [ ] 3.3 Keep upload, original download bytes/filename/disposition, image handling, removal, and CLI behavior unchanged; verify existing attachment regressions and download tests still pass, including a valid attachment above the preview cap but below the upload limit.
- [ ] 3.4 Update `attachments/README.md` with preview route authentication, response/error behavior, ID-only access, text validation, and separate preview/download limits; verify the documented responses against route tests.

## 4. Task-scoped dialog and both attachment lists

- [ ] 4.1 Add test-first task and comment card cases in rendered UI for `.md`, `.markdown`, mixed case, generic MIME, non-Markdown downloads, and images with misleading extensions; add one task-scoped preview owner and wire both card variants, then verify both open the same dialog behavior and existing image/removal actions remain separate.
- [ ] 4.2 Implement named Preview, Raw, Download, Close, loading, empty, unsupported, error, and Retry controls using the shared module and vendored responsive Dialog; verify UI tests cover exact Raw, initial Preview, unchanged download identity, no refetch on view changes, and no writes.
- [ ] 4.3 Add test-first delayed-response cases for close, A-to-B replacement, Retry, task change, unmount, and active attachment removal; implement abort plus sequence checks and verify stale responses neither reopen the dialog nor replace the current snapshot.
- [ ] 4.4 Verify keyboard opening, modal focus containment, Escape/Close, task-shortcut isolation, focus restoration, and the removed-trigger fallback in desktop and compact presentations; add regression tests and fix only preview-related behavior.
- [ ] 4.5 Verify underlying task route, scroll, comment draft, and workflow state survive opening/view switching/closing; add integrated task-detail regressions and demonstrate no task editor remount or navigation is required to preview an attachment.
- [ ] 4.6 Document the task/comment workflow, supported filename extensions, Preview/Raw/Download, the 1 MiB limit, inactive relative assets, and independent operation without Markdown Reader in Tasks README and attachment operating documentation; verify every advertised control and restriction is covered by rendered UI or transport tests.

## 5. Actual file-reader adoption and parity

- [ ] 5.1 Check whether the `markdown-reader` implementation is available and coordinate common-module ownership before modifying that consumer; verify the source exists and this change's integration scope is recorded, or leave this group blocked without building a substitute full reader or editing the other change's planning artifacts without approval.
- [ ] 5.2 Connect the actual file-reader presentation to the same package, stylesheet, and destination-policy interface while retaining its source-root/host confinement, refresh, line-range intents, exact Raw, and bound `Original` fallback; verify its existing source, navigation, line-range, and state tests pass with the common renderer.
- [ ] 5.3 Run the same report through both production consumers at equivalent theme/content widths; verify shared semantics and computed document styles, consumer-local heading targets, intentional relative-link differences, and standalone operation of each built plugin. Leave this task open if the production reader is absent.
- [ ] 5.4 Update the file reader's implementation documentation with the shared-package build order and ownership of its source policy; verify documented clean builds and existing file-opener installation/preferences guidance remain accurate.

## 6. CI and cross-package verification

- [ ] 6.1 Add shared-package install/build/test setup to the affected CI jobs and add reader dependency setup when that package exists, without changing unrelated jobs; verify Node 24 clean-checkout runs support every committed lockfile and fail when the shared package tests fail.
- [ ] 6.2 Run complete shared-package and affected-plugin tests, typechecks, applicable lint, `bb plugin types . --check`, and plugin builds; verify packaged artifacts contain the common document code/CSS without sibling checkout or runtime-plugin dependencies, and record each result separately.
- [ ] 6.3 Use a reproducible generic browser fixture to inspect the real task/comment overlay in light/dark themes at 390 px and desktop widths, plus a custom-token variant; verify reachable controls, local overflow, contrast, focus, Escape, draft/scroll preservation, and no style leakage, and record screenshots/results in the Tasks acceptance report rather than treating static checks as visual evidence.
- [ ] 6.4 Run the single read-only completion review required by the implement workflow against the full task diff, resolve blocking findings, and rerun affected checks; verify the review and resolutions are recorded and absent reader integration is not described as complete.
- [ ] 6.5 Obtain explicit approval before changing installed plugin sources/enabled state or creating owned live test records; if approved, verify the changed runtime with task and comment attachments, downloads, keyboard dismissal, and shared-reader parity, then perform scoped cleanup. Record unapproved, unavailable, or missing-reader checks as blocked and report the final installation/data state without automatic publication or preference changes.
