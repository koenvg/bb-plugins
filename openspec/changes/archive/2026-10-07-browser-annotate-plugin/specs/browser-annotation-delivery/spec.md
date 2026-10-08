# Spec Delta

## Purpose

Turns each Browser annotation into a composer mention that gives the agent a cropped screenshot with the marked area and the user's comment.

## ADDED Requirements

### Requirement: Capture at save time

When an annotation is saved, the Browser tab SHALL be captured before the save completes. Pins, the hover highlight, and the comment form SHALL NOT appear in the capture. If the capture fails, the plugin SHALL show an error, keep the comment form open, and SHALL NOT create the annotation.

#### Scenario: Clean capture

- **WHEN** the page already shows pins 1 and 2 and the user saves annotation 3
- **THEN** the stored image shows no pins and no comment form

#### Scenario: Capture fails

- **WHEN** the tab capture returns an error
- **THEN** an error is shown, the typed comment stays in the form, and no pin or pill is created

### Requirement: Crop the capture

The stored image SHALL be the selected box plus padding on each side. The padding SHALL be 10% of the viewport size on that axis, and at least 120 CSS pixels. The crop SHALL be clipped to the viewport. When the crop area is more than 60% of the viewport area, the stored image SHALL be the full viewport.

#### Scenario: Small element

- **WHEN** the viewport is 1440 by 900 and the box is 100 by 40 at the center
- **THEN** the image covers the box with 144 pixels of padding left and right and 120 pixels above and below

#### Scenario: Box near the edge

- **WHEN** the box touches the top of the viewport
- **THEN** the crop starts at the top of the viewport with no padding above

#### Scenario: Large box

- **WHEN** the box with padding covers 70% of the viewport area
- **THEN** the image is the full viewport

### Requirement: Draw the marked box

The stored image SHALL show the selected box as a dark outline inside a light outline, with no fill, and the annotation number in a dark label with light text outside the box. The image SHALL NOT use a bright accent color. The box SHALL be placed correctly when the capture's pixel size differs from the viewport's CSS size.

#### Scenario: Retina capture

- **WHEN** the capture is twice the viewport's CSS width
- **THEN** the outline matches the selected element's edges in the image

#### Scenario: Box at the top edge

- **WHEN** there is no room for the label above the box
- **THEN** the label is placed below or beside the box and does not cover it

### Requirement: Composer pill for each annotation

Each saved annotation SHALL add one mention pill to the thread's composer draft. The pill label SHALL show the annotation number and what was selected: the element tag for a click, or "region" for a drag. The label SHALL NOT change when the comment is edited.

#### Scenario: Save adds a pill

- **WHEN** the user clicks a button and saves annotation 1
- **THEN** the composer shows a pill labeled with "1" and "button"

#### Scenario: Region pill

- **WHEN** the user drags a region and saves annotation 2
- **THEN** the composer shows a pill labeled with "2" and "region"

#### Scenario: Edit keeps the label

- **WHEN** the user edits the comment of annotation 1
- **THEN** pill 1 keeps its place and its label in the draft

### Requirement: Pills and pins stay in step

Removing a pill from the composer draft SHALL delete its annotation and pin. Deleting an annotation from its pin SHALL remove its pill from the draft.

#### Scenario: Remove pill

- **WHEN** the user deletes pill 2 from the composer text
- **THEN** pin 2 disappears from the page at once, and annotation 2 is deleted, including on a page that is not shown now

#### Scenario: Pill comes back

- **WHEN** the user deletes pill 2 and undoes the delete within 3 seconds
- **THEN** pin 2 is shown again and annotation 2 is kept

#### Scenario: Delete from pin

- **WHEN** the user deletes annotation 1 from its pin
- **THEN** pill 1 is removed from the composer draft

### Requirement: Agent context for each pill

When a message with annotation pills is sent, each pill SHALL give the agent its stored image and a text with the page URL, the viewport size, the annotation number, the comment, and a statement that the box and number are an annotation overlay and not part of the page. The text SHALL use the comment as it is at send time. No selector, HTML, CSS, or source location SHALL be sent.

#### Scenario: Send one pill

- **WHEN** the user sends "Fix these" with pill 1
- **THEN** the agent receives the cropped image for annotation 1 and a text with the URL, viewport size, number 1, the comment, and the overlay statement

#### Scenario: Pills from two pages

- **WHEN** pill 1 is from page A and pill 2 is from page B, and the Browser tab now shows page B
- **THEN** the agent receives the page A image for pill 1 and the page B image for pill 2

### Requirement: Missing image at send time

If the stored image of a pill is missing at send time, the send SHALL continue. The agent SHALL receive the text for that pill with a statement that the screenshot is not available.

#### Scenario: Image file deleted

- **WHEN** the stored image for pill 1 no longer exists and the user sends
- **THEN** the message is sent and the agent receives the text for annotation 1 and the statement that the screenshot is not available

### Requirement: Clear after send

After a successful send or queue of a message, the plugin SHALL delete the annotations whose pills were in that message and remove their pins. A failed send SHALL keep them. Annotations whose pills were not in the message SHALL stay.

#### Scenario: Successful send

- **WHEN** the message with pills 1 and 2 is sent
- **THEN** pins 1 and 2 are removed and the next annotation is number 1

#### Scenario: Failed send

- **WHEN** the send fails
- **THEN** the pills stay in the draft and the pins stay on the page
