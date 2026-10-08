# Design

## Context

See proposal.md for motivation and the two specs for behavior.

The plugin uses only Plugin SDK surfaces, checked against the pinned SDK 0.6.15 types.

| Need                            | SDK surface                                                                                                                                                                                                                                          |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toolbar control per Browser tab | `app.slots.experimental_browserToolbarAction` (props: `threadId`, `tabId`, `url`, `experimental_page`)                                                                                                                                               |
| Scripts in the page             | `experimental_page.evaluate(expr, { world: "isolated" })`, page to plugin through `bb.postMessage` and `page.onMessage`                                                                                                                              |
| Screenshot                      | `useSdk().experimental_desktopBrowsers.captureTab({ instanceId, generation, tabId, threadId })` returns `{ base64, width, height, mimeType: "image/jpeg" }` with no control lease                                                                    |
| Composer                        | `useComposers()` finds the thread composer; `insert({ provider, id, label }, { at: "end" })` adds a pill; `replace()` with the draft minus a mention removes it; `draft.mentions` is the live pill list; `onSubmitted` fires after a successful send |
| Agent context                   | `bb.ui.registerMentionProvider({ resolve })` returns `{ context, experimental_images: [{ type: "localImage", path }] }`                                                                                                                              |

Prior work that this design copies:

- OpenForge Task Browser: the overlay script (crosshair layer, drag rectangle, element snap through `elementsFromPoint`, inline comment form, capture-phase listeners), per-URL markers, and the capture reuse.
- Orca Design Mode: a closed shadow root for overlays, turning off the overlay's pointer events around `elementFromPoint`, a white outline with a dark shadow, a label pill, `rectPage` plus an `isFixed` flag for pins, hiding overlays around the capture in a `finally`, and measuring scale from the captured bitmap.

## Goals / Non-Goals

**Goals:**

- No BB core change and no native dependency.
- The page cannot read or change saved annotations.
- Image processing is deterministic and testable without a browser.

**Non-Goals:**

- Annotations inside iframes.
- Pins that follow an element when the layout changes. A pin marks a place on the page, not an element.
- Import of annotations from the built-in plugin.
- A review panel. The pills and pins are the review surface.

## Decisions

### 1. The server owns annotation state

Annotations live in the plugin's SQLite database (`bb.storage.database()`): `id`, `threadId`, `urlKey`, `number`, `kind` (element tag or `region`), `comment`, `rectPage`, `isFixed`, `viewport`, `imagePath`, `resolvedAt`, `createdAt`. The frontend uses typed plugin RPC from one contract module: `create`, `update`, `remove`, `listForUrl`, `listForThread`, `clearResolved`.

- Why: the mention `resolve` runs on the server and needs the comment and image path at send time. Pins must survive a remount of the toolbar component and a reload of the app.
- Alternative: keep state in the frontend and pass it in the mention id. Rejected: an edit after insert would not reach `resolve`, and ids would carry user text.

### 2. Picker and pins run in the isolated world

One injected script owns a full-viewport host element with a closed shadow root. It draws the highlight, the drag rectangle, the comment form, and the pins. It sends `selection`, `save`, `cancel`, `editPin`, and `deletePin` messages through `bb.postMessage`. The frontend pushes pins and mode changes with `evaluate`.

- The script is idempotent: arming removes any earlier instance first.
- The frontend injects it again when `url` changes, because navigation drops it. It also checks once a second that the script is still there, because a reload of the same URL does not change `url`.
- The overlay layer receives all pointer input while annotate mode is on, so page elements never get the click. Pointer events stop at the host, so page bubble listeners do not see them.
- Key events stop at a `window` capture listener while the comment form has focus, so page hotkeys do not see typing. That listener also handles Enter and Esc for the form, because stopping propagation there also skips listeners inside the shadow root.
- The once-a-second check calls a `ping` method, so it never changes the mode that the page owns.
- Why the isolated world: page scripts cannot read the comments or fake messages.
- Alternative: draw in the app over the Browser view. Rejected: the plugin cannot place UI over the native Browser view.

### 3. The frontend captures, crops, and draws

On `save`, the frontend does this:

1. It gets the next number (Decision 8) and `evaluate` hides the overlay host.
2. `captureTab` takes the JPEG. The frontend finds `instanceId` and `generation` from `listTabs` for the `tabId`.
3. `evaluate` shows the overlay again, in a `finally`.
4. A pure function computes the crop from the box, viewport, and image size: scale is `imageWidth / viewport.width`, padding is `max(10% of the axis, 120 CSS px)`, clipped to the viewport, full view when the crop is over 60% of the viewport area.
5. Canvas code draws the crop, a dark outline inside a light outline (no fill, no accent color), and the number label outside the box (above, else below, else beside, else inside the top-left corner when the box fills the image).
6. The frontend encodes a JPEG and sends it with the `create` RPC as base64.

- Why the frontend: canvas is available there, so there is no native image library on the server.
- Alternative: capture and crop on the server. Rejected: it needs an image library such as `sharp`.

### 4. Images are files in the plugin data directory

The server writes each image to `<plugin data dir>/annotations/<threadId>/<id>.jpg`. `remove` deletes the file at once only for an annotation that was never sent. Files of sent annotations stay for 1 hour, because BB can read a sent image later, for example for a queued message. A sweep at start and after each `clearResolved` deletes files that no row uses and that are older than that. The live check confirmed that BB accepts this absolute server path for `localImage`. It finds the directory from the plugin database path, as `bb-plugin-tasks-plus/attachments` does. `resolve` returns that absolute path as `localImage`.

- Why: the plugin controls cleanup. `projects.attachments` has no remove operation.
- Fallback: if `localImage` must be an attachment path, upload with `projects.attachments.upload` and keep the returned path.

### 5. Mention ids and labels

The mention provider id is `annotation`. The mention id is the annotation `id`. The label is `<number> · <kind>`, for example `1 · button` or `2 · region`.

- `search` returns an empty list, so annotations appear only through the toolbar flow and not in the `@` menu.
- The label does not contain the comment, because the SDK cannot rename a pill in place.

### 6. Clear after send through `resolvedAt`

`resolve` sets `resolvedAt` on the annotation. When `onSubmitted` fires, the frontend calls `clearResolved(threadId)`, which deletes resolved annotations and their files and returns the removed ids so that the open pages drop the pins.

- A failed send does not fire `onSubmitted`, so the annotations stay. The next `resolve` sets `resolvedAt` again.
- Why: `onSubmitted` does not say which mentions were sent, and the draft is already cleared when it fires.

### 7. Pill and pin sync

- Delete from pin: the server removes the annotation, then the frontend calls `replace()` with the current draft minus that mention.
- Both cases use the same `remove` RPC. There is no separate "unsent only" path.
- Pill removed from the draft: the frontend watches `draft.mentions` of the thread composer. An annotation whose pill was seen in the draft and is now absent is removed. An annotation whose pill was never seen is not removed, so a pill that is not yet rendered cannot delete a new annotation. A submit also empties the draft, so a missing pill is removed only after 3 seconds. `onSubmitted` cancels the pending removals. A failed send restores the draft, so the pills come back and their removals are cancelled. If `onSubmitted` comes later than 3 seconds, `resolve` has already run, so the agent still gets the context and the image file stays for the sweep.

### 8. URL key and numbering

- `urlKey` is the URL without its hash.
- The number is the highest unsent number in the thread plus 1. After a full clear, numbering starts again at 1.
- The frontend needs the number before it draws the image, so it computes it from `listForThread` and sends it with `create`. The server rejects a number that is not the next one, so two tabs that save at the same time cannot get the same number. The user saves again.
- The page sends its own `location.href` with a save, because a client-side route change can reach the page before the `url` prop updates.

### 9. Missing image

If the image file is missing, `resolve` returns only the text, with the note that the screenshot is not available. It never throws, because a throw blocks the send.

### 10. Theme

The page cannot read BB's CSS variables. The toolbar component reads BB's tokens (`--popover`, `--background`, `--foreground`, `--muted-foreground`, `--border`, `--primary`, `--primary-foreground`, `--ring`, `--destructive`, `--font-sans`) from the app document. It watches class, style, and `data-theme` changes and the color-scheme media query, then sends the values to the page with `setTheme`. The page sets them as custom properties on its host, with neutral light defaults. The hover highlight, drag box, and screenshot box stay neutral black and white, because they sit on the page's colors, not BB's.

### 11. Pill removal feedback

The pin hides as soon as its pill leaves the draft. A shared in-memory set links the composer watcher and each Browser toolbar. The server delete still waits 3 seconds (Decision 7). If the pill comes back, the pin is shown again.

## Risks / Trade-offs

- [All browser and composer surfaces are `experimental_`] → Keep each SDK call behind one small adapter module, so that a BB update needs one file change.
- [`localImage` path is read on another host than the plugin server, for remote environments] → Confirmed on a local desktop host only. Use the attachment upload fallback if a remote host fails.
- [A pin stays at its old place when the page layout changes] → Accepted. The stored image shows what the user marked.
- [The built-in plugin stays on] → The README tells users to run `bb plugin disable agent-annotations`. Both plugins can run without errors, but the toolbar shows two controls.
- [Hostile pages] → The page cannot reach the isolated world. The frontend still validates each message shape and clamps rectangles to the viewport.
- [Large captures] → Crops are small. Full-view images are capped by `captureTab`'s bounded JPEG and stay under the 10 MB image limit.

## Migration Plan

1. Install the plugin.
2. Run `bb plugin disable agent-annotations`.
3. Rollback: `bb plugin disable browser-annotate`, then `bb plugin enable agent-annotations`.

No data moves between the two plugins.
