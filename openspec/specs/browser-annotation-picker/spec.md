# browser-annotation-picker Specification

## Purpose

Lets the user mark areas of a page in a BB Browser tab and attach a comment to each area, so that an agent can act on visual feedback.

## Requirements

### Requirement: Annotate mode control

The Browser toolbar SHALL show an Annotate control in the desktop app. The control SHALL turn annotate mode on and off for that tab. Esc SHALL turn annotate mode off when no comment form is open. The control SHALL NOT be shown when the plugin has no script access to the page.

#### Scenario: Turn annotate mode on

- **WHEN** the user clicks the Annotate control in a Browser tab
- **THEN** the cursor becomes a crosshair over the page and the control shows that annotate mode is on

#### Scenario: Leave annotate mode with Esc

- **WHEN** annotate mode is on, no comment form is open, and the user presses Esc
- **THEN** annotate mode turns off and the existing pins stay on the page

#### Scenario: Web client

- **WHEN** the Browser tab is shown in a client without page script access
- **THEN** the Annotate control is not shown

### Requirement: Annotate UI follows the BB theme

The comment form, its buttons, and the pins SHALL use BB's current theme colors and font, and SHALL update when BB switches between light and dark. The hover highlight and drag outline SHALL use a neutral light and dark outline that shows on any page. The UI SHALL NOT use a bright accent color of its own.

#### Scenario: Dark BB theme

- **WHEN** BB uses a dark theme
- **THEN** the comment form has BB's dark surface, text, and border colors

#### Scenario: Theme switch

- **WHEN** the user switches BB from light to dark while a pin shows
- **THEN** the pin and any open form change to the dark theme colors

### Requirement: Annotate mode does not trigger the page

While annotate mode is on, pointer and keyboard input used for annotating SHALL NOT reach the page's own handlers. Clicks SHALL NOT follow links, submit forms, or change focus inside the page.

#### Scenario: Click a link while annotating

- **WHEN** annotate mode is on and the user clicks a link
- **THEN** the page does not navigate and the link's box is selected

### Requirement: Hover highlight

While annotate mode is on and no comment form is open, the element under the cursor SHALL be outlined. The outline SHALL be visible on light and dark pages. A label next to the outline SHALL show the element's tag and its size in CSS pixels.

#### Scenario: Move over a button

- **WHEN** annotate mode is on and the cursor moves over a button
- **THEN** the button is outlined and the label shows `button` and its width and height

#### Scenario: Dark page

- **WHEN** the page background is black
- **THEN** the outline is still clearly visible

### Requirement: Select an element or a region

A click SHALL select the box of the highlighted element. A drag of at least 6 CSS pixels in either direction SHALL select the dragged rectangle instead. The selected box SHALL be clipped to the viewport.

#### Scenario: Click selects element

- **WHEN** the user clicks while a card element is highlighted
- **THEN** the selection is the card's box

#### Scenario: Drag selects region

- **WHEN** the user drags from one point to another point 200 pixels away
- **THEN** the selection is the dragged rectangle and not the box of any element

#### Scenario: Short drag counts as click

- **WHEN** the user drags less than 6 pixels
- **THEN** the selection is the box of the highlighted element

### Requirement: Comment entry

After a selection, a comment form SHALL open next to the selected box. Enter SHALL save, Shift+Enter SHALL add a new line, and Esc SHALL cancel without creating an annotation. A blank comment SHALL NOT be saved. A comment SHALL be at most 4000 characters. After a save or cancel, annotate mode SHALL stay on so that the user can add the next annotation.

#### Scenario: Save a comment

- **WHEN** the user types "Too much padding" and presses Enter
- **THEN** the annotation is saved and annotate mode stays on

#### Scenario: Blank comment

- **WHEN** the comment is empty or only spaces and the user presses Enter
- **THEN** nothing is saved and the form stays open

#### Scenario: Cancel

- **WHEN** the user presses Esc in the comment form
- **THEN** the form closes and no annotation or pin is created

### Requirement: Numbered pins

Each saved annotation SHALL show a numbered pin on the page at its box. Numbers SHALL be unique among the thread's unsent annotations and SHALL increase in save order. A pin SHALL stay at its box when the page scrolls. A pin for a box in a fixed or sticky element SHALL stay in place on screen.

#### Scenario: Second annotation

- **WHEN** the thread has one unsent annotation and the user saves another
- **THEN** the new pin shows the number 2

#### Scenario: Scroll the page

- **WHEN** the user scrolls down by 300 pixels
- **THEN** each pin moves with its box

### Requirement: Pins are kept per URL

Unsent annotations SHALL be kept per page URL, where the URL includes the query and excludes the hash. When the Browser tab shows a URL, the pins for that URL SHALL be drawn. This SHALL also apply after a reload, a back or forward navigation, or a client-side route change.

#### Scenario: Navigate away and back

- **WHEN** page A has pins 1 and 2, the user goes to page B, then goes back to page A
- **THEN** pins 1 and 2 are drawn on page A again

#### Scenario: Hash change

- **WHEN** the URL changes only in its hash
- **THEN** the same pins stay on the page

#### Scenario: Query change

- **WHEN** the URL changes only in its query
- **THEN** the pins of the old URL are removed and the pins of the new URL are drawn

### Requirement: Edit or delete from a pin

Clicking a pin SHALL open its comment for editing, with a Delete action. A saved edit SHALL change the comment that the agent receives, unless the message was already sent. Delete SHALL remove the annotation.

#### Scenario: Edit a comment

- **WHEN** the user clicks pin 1, changes its comment, and saves
- **THEN** the next send gives the agent the new comment for annotation 1

#### Scenario: Delete from pin

- **WHEN** the user clicks pin 2 and chooses Delete
- **THEN** pin 2 is removed from the page
