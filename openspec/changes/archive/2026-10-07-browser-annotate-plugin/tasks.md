# Tasks

## 1. Scaffold and confirm SDK surfaces

- [x] 1.1 Scaffold `bb-plugin-browser-annotate/` with the same layout, scripts, engines, and SDK pin (0.6.15) as `bb-plugin-markdown-reader`, with `server.ts` and `app.tsx` entries; verify `npm ci`, `npm run typecheck`, and `bb plugin build` succeed on the empty plugin.
- [x] 1.2 Confirm in the pinned SDK types that every surface in the design's Context table exists with the expected shape; verify by a type-only test file that compiles.
- [x] 1.3 Add one SDK adapter module that wraps the experimental browser, capture, and composer calls behind plain functions; verify the typecheck passes and no other module imports the experimental names.

## 2. Server state and mention provider

- [x] 2.1 Add the annotations table and migration, with number assignment per thread and `urlKey` that drops the hash; verify unit tests cover numbering after deletes, numbering restart after a full clear, and URL keys with and without hash or query.
- [x] 2.2 Add image storage under the plugin data directory with path checks that stop escapes, and delete the file with its annotation; verify tests cover write, delete, a path escape attempt, and a missing file on delete.
- [x] 2.3 Add the typed RPC contract `create`, `update`, `remove`, `listForUrl`, `listForThread`, `clearResolved`, with comment validation (non-blank, at most 4000 characters) and base64 size limits; verify contract tests cover each method, blank and too-long comments, unknown ids, and annotations of another thread.
- [x] 2.4 Register the `annotation` mention provider with empty `search` and a `resolve` that returns the URL, viewport, number, comment, overlay statement, and image, sets `resolvedAt`, and returns text with a "screenshot not available" note when the file is missing; verify tests cover each spec scenario of "Agent context for each pill" and "Missing image at send time", and that no selector, HTML, or CSS text appears in the context.

## 3. Image crop and drawing

- [x] 3.1 Implement the pure crop function (scale from image width, padding of 10% or 120 CSS px, viewport clip, full view above 60% of the area); verify unit tests for each scenario of "Crop the capture", plus a 2x capture.
- [x] 3.2 Implement the label placement function (above, else below, else beside, else inside the top-left corner when the box fills the image); verify unit tests for a box at the top edge, the bottom edge, and a box that fills the crop.
- [x] 3.3 Implement the canvas renderer that draws the crop, the outline with no fill, and the label, and encodes a JPEG; verify a test with a fake 2D context checks the source crop, the outline coordinates and color, and that no fill is drawn, for a 1x and a 2x capture.

## 4. In-page picker and pins

- [x] 4.1 Write the isolated-world script: closed shadow root host, idempotent arm and teardown, capture-phase pointer and key listeners that stop page handlers while annotate mode is on; verify a jsdom test that a click on a link in annotate mode does not navigate or reach the page listener, and that arming twice leaves one host.
- [x] 4.2 Add the hover highlight (white outline, dark shadow, tag and size label) and selection (click snaps to the element, a drag of 6 px or more selects a region, clipped to the viewport); verify jsdom tests for click, drag, short drag, and a highlight on a black background.
- [x] 4.3 Add the inline comment form (Enter saves, Shift+Enter new line, Esc cancels, blank blocked, 4000 character limit) and the `hide` and `show` commands used around the capture; verify jsdom tests for each scenario of "Comment entry".
- [x] 4.4 Add pin drawing from a pin list using `rectPage` and `isFixed`, with click to edit and delete; verify jsdom tests that pins move on scroll, fixed pins stay in place, and edit and delete post the expected messages.
- [x] 4.5 Add message validation in the frontend for every message the script sends, with rectangle clamping; verify tests reject unknown types, wrong shapes, and rectangles outside the viewport.

## 5. Toolbar control and composer sync

- [x] 5.1 Register the Browser toolbar action: hide it when `experimental_page` is null, toggle annotate mode, inject the script again and load pins with `listForUrl` on each `url` change; verify component tests for the null page, toggle, Esc, and a URL change that loads the other page's pins.
- [x] 5.2 Wire the save flow: hide overlay, capture, show overlay in `finally`, crop and draw, `create`, insert the `<number> · <kind>` pill at the end of the thread composer, and keep the form open with an error when the capture fails; verify component tests with a fake adapter for success, capture failure, and that the overlay is shown again after a failure.
- [x] 5.3 Wire edit and delete from a pin to `update` and `remove`, and remove the pill on delete; verify component tests that the edited comment is stored and the pill keeps its label, and that a delete removes the pill.
- [x] 5.4 Watch `draft.mentions` to remove annotations whose pill was seen and is now gone, and wire `onSubmitted` to `clearResolved`; verify tests for a removed pill on another page, a new annotation whose pill is not yet in the draft, a successful send that does not double-delete, and a failed send that keeps pins.
- [x] 5.5 Write `bb-plugin-browser-annotate/README.md` (use, the disable command for `agent-annotations`, rollback, desktop-only and iframe limits, experimental API warning) and add the plugin to the root README table; verify the documented commands match the plugin id and the repository's `npm run check` passes.

## 6. Integration check

- [x] 6.1 Run the plugin's tests, typecheck, lint, format check, and `bb plugin build`; verify all pass.
- [x] 6.2 Install the checkout, disable `agent-annotations` with approval, and in a real Browser tab add a click annotation and a region annotation on two pages, go back and forth, edit one, delete one pill, and send; verify the agent receives one cropped image with a black and white box per remaining pill, the pins are cleared after send, and the built-in control is gone. Follow the plugin-verification approval rules and record blockers as blockers.
