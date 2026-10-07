# Proposal

## Why

BB's built-in Browser annotations send the agent a description of the element. A screenshot of the marked area gives the agent better results. The built-in plugin also loses its pins on navigation, and other plugins cannot extend it.

## What Changes

- Add a new plugin, `bb-plugin-browser-annotate`, that replaces the bundled `agent-annotations` plugin.
- Add an "Annotate" control to the Browser toolbar. When it is on, the element under the cursor is highlighted. A click selects that element's box. A drag selects a free region.
- After a selection, ask for a comment. A saved comment becomes a numbered pin on the page and a mention pill in the composer.
- At save time, capture the Browser tab. Crop the capture to the box plus padding and draw the numbered box onto the crop. Store the image.
- At send time, each pill gives the agent its stored image and a short text: URL, viewport size, a note that the box is an overlay, and the comment.
- Keep pins per URL. When the user goes back to a page, its pins are drawn again. Clicking a pin edits or deletes the comment.
- Keep pills and pins in step: deleting one deletes the other. A sent message clears its annotations.
- Do not send selectors, HTML, CSS, or source locations.
- Document that users turn off the built-in plugin with `bb plugin disable agent-annotations`. The plugin cannot do this itself.

## Capabilities

### New Capabilities

- `browser-annotation-picker`: Selecting areas in a Browser tab, the hover highlight, the comment flow, numbered pins, pins kept per URL, and editing or deleting pins.
- `browser-annotation-delivery`: Capturing and cropping the annotated area, drawing the box, mention pills in the composer, the agent context sent for each pill, and clearing after send.

### Modified Capabilities

None.

## Impact

- New plugin directory `bb-plugin-browser-annotate/` with a frontend entry (toolbar action, composer integration), a server entry (mention provider, image storage), and tests. Add it to the root README plugin table.
- Uses experimental Plugin SDK surfaces: `experimental_browserToolbarAction`, `experimental_page.evaluate` and `onMessage`, `experimental_desktopBrowsers.captureTab`, and `experimental_images` in mention `resolve`. A BB update can break them.
- Works only in the desktop app. `experimental_page` is `null` on web and remote clients. Annotations inside iframes are not supported.
- No BB core change and no change to other plugins. Users must disable the bundled `agent-annotations` plugin by hand to avoid two Annotate controls.
