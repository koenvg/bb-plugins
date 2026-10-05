# Design

## Context

See `proposal.md` for motivation and `specs/markdown-reader/spec.md` for the behavior contract. The repository has independent TypeScript/React plugin packages, per-package test scripts, and an explicit CI matrix. `bb-plugin-compose-chat` demonstrates frontend registration and scoped theme-token styling, but it changes native chat DOM; this reader must not depend on that approach.

The inspected SDK 0.5.9 declarations and current plugin-authoring references expose `fileOpener` with `path`, source identity, optional `experimental_lineRange`, and a bound `Original` preview. Existing frontend packages target SDK 0.5.29 and BB >=0.44. There is no inspected general Markdown replacement slot. File openers cover live files only; Git snapshots and deleted files remain host-owned.

The approved visual reference is `/Users/koen/.bb/thread-storage/thr_a8vncu5w4e/mockups/markdown-reader.html`, approved in thread `thr_a8vncu5w4e`. It is an illustrative static document, not a working Markdown parser. Static checks passed; Chrome/Chromium was unavailable for browser captures. `DESIGN.md` supplies native color and control conventions; the user-approved reader expands document typography without changing surrounding BB chrome. The existing Liquid Glass spec retires that package, so this change does not reinstall it or treat its historical appearance as a required test environment.

## Goals / Non-Goals

**Goals:**

- Separate source access and security from document presentation, with small interfaces exercised by both production and tests.
- Reproduce the approved reading rhythm with generic Markdown content and active host theme tokens.
- Keep BB responsible for file routing, URL routing, tab chrome, preferences, and original-preview fallback.
- Bound parsing, highlighting, asynchronous requests, and temporary preview-resource lifetimes.

**Non-Goals:**

- Recreate BB's tab strip, infer audit-report semantics, synthesize document metadata, or copy the mockup's shortened Raw excerpt.
- Add file editing, file watchers, persistent document caches, MDX execution, app-wide DOM styling, or a separate theme preference.
- Publish, install, pin an opener, or change other plugins as a side effect of implementation.

## Decisions

### 1. Register a dedicated file opener

Create `bb-plugin-markdown-reader` and register one opener for `md` and `markdown`. Use the normal BB scaffold and current declarations; follow the collection's SDK 0.5.29 / BB >=0.44 baseline, validating exact used symbols before implementation. Use an owned reader toolbar inside the plugin body, not a cloned BB tab strip. Controls are Preview/Raw, outline, Refresh, and Open in BB preview.

Render the supplied `Original` to delegate inside the existing file tab; do not navigate back through file-opener resolution. A crash remains isolated by BB's plugin rendering machinery. Normal install does not override a client preference that pins another opener.

Alternatives: global CSS can change native previews but depends on BB DOM structure and risks chat/diff leakage. The source-code renderer slot does not replace the document preview. A separate reader panel would require a second navigation workflow. The file opener is the direct supported fit.

### 2. Keep a source module behind a narrow read interface

The source module accepts the validated opener target and returns a text snapshot with its content hash, source identity, confined root, and document directory. Its interface also resolves document destinations into typed fragment, file, external URL, image, or rejected outcomes. The server SDK adapter handles actual source-root and host resolution; tests provide an in-memory SDK adapter at the same seam. Do not expose separate workspace/host/storage implementations to the view.

Resolve workspace roots from the supplied environment/project/host identity; resolve thread-storage locations from the supplied thread identity. For absolute host files, confine relative asset access to the containing directory unless the host contract supplies an explicit permitted root. Do not reinterpret nullable IDs or silently fall back to the server host. Forward reader reads through `bb.sdk.files` with explicit host and root confinement. Resolve `..` only when the decoded, normalized path stays lexically inside that root; reject encoded traversal, malformed encodings/URLs, and executable or unsupported schemes before any SDK read, preview allocation, or navigation.

The operator approved a revised destination contract in BBP-26 after the SDK compatibility investigation. Local file links use BB's normal source-aware opening behavior and permissions after lexical path checks. The plugin does not guarantee that a symlink's final target remains inside the original source root during native file navigation. Reader reads and local-image content requests retain SDK root/symlink confinement during the operation. Metadata-only validation before activation is not required, and confined SDK calls may occur before the host rejects a symlink escape. No BB core or SDK prerequisite is required for this revised contract.

Expose only validated read/asset transport RPC needed by the opener, never a general arbitrary filesystem endpoint. Reads are read-only. No host write methods are used. Allocate `files.createPreview` transport only for lexically valid supported local-image destinations, with a bounded TTL and explicit source host/root; do not embed host IDs or absolute paths in image URLs. The SDK may allocate the root preview lease before validating an individual asset. Actual image requests must use the SDK's root/symlink confinement; a rejected request must not deliver outside-root content and must leave readable alt/error content. Confined read calls, preview allocation, and image requests before host-side rejection are permitted. Reuse a transport within the loaded source and drop references on source changes/unmount. Expiry is the cleanup mechanism where no revocation method exists; refresh recreates expired URLs.

Alternative: direct server-local filesystem reads are simpler but wrong for connected hosts and thread-storage routing. The SDK confines access and gives one host-aware implementation.

### 3. Parse generic Markdown without active HTML

Use `react-markdown` with `remark-gfm`. Leave raw HTML disabled and do not add `rehype-raw`, HTML execution, or MDX. Supply explicit rendering for headings, anchors, images, tables, blockquotes, and fences. The destination resolver and BB's file/URL navigation modules handle safe activation; remote HTTP(S) images use ordinary image URLs and local assets use confined preview transport. Preserve modifier-click and accessible link semantics where the SDK supports them.

Generate heading IDs and outline entries from the same parsed document, including inline heading text, repeated headings, and non-ASCII text. Namespace DOM IDs per mounted reader to prevent cross-tab collisions, while mapping conventional Markdown fragment names to those targets for outline and document links. Retain source positions for Raw line navigation. Source text stays immutable and is never recreated from the parsed tree.

Use Refractor core with explicit JSON, JavaScript, TypeScript, Bash, Python, markup and CSS grammars, plus their required shared grammar. Document aliases in the package README. Apply one code policy on the existing Markdown tree, with a 20 KiB rendered UTF-8 byte guard before tokenization, including the final rendered newline. Unknown or missing language labels, larger fences and tokenizer failures stay plain code. Accept only passive text/span tokens and verify the complete rendered text before use. No auto-detection, JSON parsing, pretty printing or source changes are permitted, even for multiline JSON. Raw remains the complete exact source. Use scoped host UI tokens and typography, not an independent syntax palette or global theme. GFM task lists remain read-only.

Alternative: BB's exported `Markdown` preserves chat typography and exposes only content/className, which does not provide the heading/destination controls needed here. Handwritten Markdown parsing or custom HTML sanitization adds unnecessary correctness and security work.

### 4. Preserve the mockup's rhythm, not its fixture-specific decorations

Use scoped CSS in a reader-owned root with BB font, canvas, ink, muted-foreground, surface-recessed, border, hover, and focus tokens. Do not install a content script or style host-owned DOM. The mockup's literal light/dark values are demonstration tokens, not plugin constants. The production reader follows the app's active theme and therefore omits its moon switch.

Visual defaults:

- Reading column capped around 720 px, targeting roughly 65 to 75 characters for prose at 16 px and 1.75 line height.
- About 48 px side padding and 52 to 68 px top padding in wide panels, reducing to 24 px sides and 38 px top in compact panels.
- Document H1 approximately 30 to 39 px, section H2 approximately 20 to 21 px, and section spacing around 46 px above / 14 px below. Lower heading levels remain distinct without oversized narrow-panel typography.
- Quiet 12 to 13 px toolbar/table metadata, system monospace for actual code, 6 px local container radii, hairline table row separators, and no resting shadows.
- Tables and code scroll in local containers. Images fit the column and retain intrinsic aspect ratio. No audit-specific status colors or pill inference.
- Outline aside around 164 px with about 60 px separation when the reader container exceeds roughly 1080 px. Below that, use a collapsed inline disclosure. Measure the panel container, not the desktop window; BB commonly shares the screen with chat.

Keep the outline visible by default only when headings exist; its toggle is local reader state. Raw uses a read-only source presentation with stable source-line identification, not a second document parser. No title, date, or review label is invented when absent from the Markdown.

Alternative: a Notion app clone would introduce irrelevant navigation and branding. The approved direction is a spacious document inside BB, retaining BB's controls and type family.

### 5. Use explicit, bounded reader state

The reader owns a single current target, loaded snapshot, load status, view, outline visibility, and fallback choice. Preview is the initial view unless BB requests source lines; a requested inclusive line range selects Raw and reveals actual source lines. Clamp navigation to existing lines, treat each supplied range object as a new intent, and preserve the snapshot when only the range changes.

Read on mount/target changes and explicit Refresh. Do not promise automatic watching. Sequence asynchronous reads so superseded work cannot overwrite the current document, and discard results after unmount. Refresh errors visibly report failure; any retained previous snapshot is explicitly stale rather than passed off as a successful read. Loading, empty, failed, non-text, and over-limit states provide accessible text and appropriate Retry/fallback actions. Support UTF-8 text up to 1 MiB; inspect reported byte size before decoding/rendering when the SDK allows it, and avoid parsing larger bodies. Do not use the 25 MB SDK write limit as a reader limit.

Alternative: automatic polling or watchers would add host load, lifecycle complexity, and an unapproved freshness promise. Explicit Refresh is sufficient for the first reader.

### 6. Verify through the module interfaces and representative views

Test source/root/host resolution and destination policy at the source module interface using controlled SDK adapters. Lexically rejected destinations must produce no SDK read, preview allocation, or navigation. Test SDK confinement failures for reader reads and local-image requests during the operation, allowing the attempted SDK call but no outside-root content. Test local file links through BB's normal navigation with the correct source/host; do not assert a stronger plugin symlink guarantee or a metadata-only precheck. Test the reader through rendered UI using Testing Library and BB's frontend harness, including opener registration, Raw exactness, outline collisions, line-range intents, view state, read races, refresh failures, and `Original` delegation. Use an ordinary GFM report fixture plus malicious links/HTML, long lines, empty documents, and size limits, rather than tests for each private helper.

Capture the approved report fixture at 390 px compact width, a roughly 760 px split-panel width, and a 1440 px wide reader, in built-in light/dark themes. Include a non-default theme-token harness variant without reinstalling retired Liquid Glass. Check local scrolling, outline collapse, focus, contrast, and no style leakage into chat. Automated browser tooling must be available for visual verification; static HTML checks alone do not establish visual fidelity.

## Risks / Trade-offs

- Experimental SDK behavior can drift. Validate used current declarations and host behavior before binding the implementation; retain the host's bound fallback and document engine minimums.
- Workspace, absolute-host, and thread-storage roots differ. Resolve every target explicitly, test each source and disconnected-host behavior, and never make server-local assumptions.
- Reject malformed encodings and lexical root escapes in the source module. Reader reads and local-image requests rely on SDK root/symlink confinement during the operation, not before preview allocation. Local file links follow BB's normal permissions and opening behavior without a plugin guarantee against symlink escapes from the original root. Document this limit rather than implying stronger protection.
- Loading remote images makes network requests to their authors' hosts. Document that behavior, use only ordinary HTTP(S) image loading without authenticated BB proxying, and reject active schemes and inline executable content.
- Large documents and fences can block the UI. Enforce the 1 MiB document limit and 20 KiB per-fence highlighting budget, with plain-code or original-preview fallbacks.
- The visual reference lives in thread storage. Preserve its path and approval in this design; use the portable measurements above and a committed Markdown fixture during implementation, and report if the original reference is unavailable.
- Browser tooling was missing during mockup creation. Provision or obtain approved browser access during implementation, or report visual verification blocked rather than claiming it passed.
- Generic Markdown will not reproduce mockup-only status pills or synthesized metadata. Preserve document semantics and treat the mockup as a typography/layout reference, not a report parser.

## Migration Plan

1. Scaffold and implement only the new package; add the collection README entry and CI matrix entry. No database migration or existing-plugin refactor is needed.
2. Run focused tests, typechecking, plugin build, broader affected checks, browser validation, and the required independent completion review.
3. After explicit user approval for the local installation, install the built plugin and verify live file-opener selection, correct source routing, navigation, theme changes, and fallback. Otherwise leave it uninstalled and report the live acceptance check as pending.
4. The user can select Markdown Reader or BB under File openers. Disabling/removing the plugin or selecting BB restores the built-in preview; preserve unrelated preferences and plugin state.
