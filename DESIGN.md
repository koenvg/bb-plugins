---
name: BB plugins
description: Plugin UI that reads as part of BB, with color reserved for state.
colors:
  canvas: "oklch(100% 0 0)"
  ink: "oklch(32.11% 0 0)"
  primary: "oklch(27% 0 0)"
  primary-foreground: "oklch(100% 0 0)"
  muted-foreground: "oklch(44% 0 0)"
  subtle-foreground: "oklch(50% 0 0)"
  secondary: "color-mix(in oklch, oklch(32.11% 0 0) 8%, oklch(100% 0 0))"
  muted: "color-mix(in oklch, oklch(32.11% 0 0) 11%, oklch(100% 0 0))"
  sidebar: "color-mix(in oklch, oklch(32.11% 0 0) 2.2%, oklch(100% 0 0))"
  surface-recessed: "color-mix(in oklab, oklch(32.11% 0 0) 6%, oklch(100% 0 0))"
  border: "color-mix(in oklch, oklch(32.11% 0 0) 14%, oklch(100% 0 0))"
  border-hairline: "color-mix(in oklch, oklch(32.11% 0 0) 14.7%, oklch(100% 0 0))"
  input: "color-mix(in oklch, oklch(32.11% 0 0) 29.5%, oklch(100% 0 0))"
  state-hover: "color-mix(in oklab, oklch(32.11% 0 0) 5.9%, transparent)"
  state-active: "color-mix(in oklab, oklch(32.11% 0 0) 11.8%, transparent)"
  success: "oklch(70% 0.15 155)"
  attention: "oklch(74% 0.15 80)"
  warning: "oklch(70% 0.16 50)"
  warning-text: "oklch(55% 0.14 50)"
  destructive: "oklch(45% 0.19 25.86)"
  timeline-accent: "oklch(55% 0.1 250)"
  merged-violet: "#7c3aed"
  compose-surface: "color-mix(in oklab, oklch(32.11% 0 0) 2%, oklch(100% 0 0))"
  compose-message: "color-mix(in oklab, oklch(32.11% 0 0) 7%, oklch(100% 0 0))"
typography:
  title:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 600
    lineHeight: 1.43
  body:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  micro:
    fontFamily: "Inter Variable, Inter, sans-serif"
    fontSize: "0.625rem"
    fontWeight: 500
    lineHeight: 1.4
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  full: "9999px"
  compose-frame: "14px"
  compose-message: "10px"
spacing:
  unit: "4px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
components:
  button-default:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.canvas}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "8px 16px"
  button-ghost-hover:
    backgroundColor: "{colors.state-hover}"
    textColor: "{colors.ink}"
  button-sm:
    rounded: "{rounded.md}"
    height: "32px"
    padding: "0 12px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
  card:
    backgroundColor: "{colors.canvas}"
    rounded: "{rounded.lg}"
    padding: "8px 10px"
  pill:
    backgroundColor: "transparent"
    textColor: "{colors.muted-foreground}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  pill-urgent:
    backgroundColor: "color-mix(in oklab, oklch(45% 0.19 25.86) 10%, transparent)"
    textColor: "{colors.destructive}"
    rounded: "{rounded.full}"
    padding: "0 6px"
  menu:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "4px"
  thread-row:
    rounded: "{rounded.lg}"
    height: "48px"
    padding: "0 8px"
  compose-frame:
    backgroundColor: "{colors.compose-surface}"
    rounded: "{rounded.compose-frame}"
  compose-message:
    backgroundColor: "{colors.compose-message}"
    rounded: "{rounded.compose-message}"
---

# Design System: BB plugins

## Overview

**Creative North Star: "The Quiet Instrument"**

Plugin UI is a grayscale instrument panel that lives inside BB. Ink on canvas does almost all the work. Hierarchy comes from weight, size, and the muted/subtle foreground steps, not from color. Color appears only when it carries state: a check passed, a task is in progress, a PR is blocked. When nothing needs the user, the plugin is quiet.

The plugins do not own a palette. Use BB's CSS custom properties and host Tailwind utilities for colors, fonts, radii, and floating-layer shadows. The frontmatter retains the recorded BB v0.43.x light-theme snapshot, with Compose Chat's derived surfaces added from current CSS. It is a documentation baseline, not a fresh measurement of BB 0.44 or the active theme. Runtime code references the host token, not the recorded literal. Host themes may supply a chromatic primary; inherit it rather than forcing grayscale.

Each plugin may add a small accent of its own: status marks, count pills, a signature row or card shape, or small motion. These accents sit on top of the native structure and must not replace it. Direction for new controls is calm and roomy: generous padding and comfortable hit areas, inside BB's type scale.

**Key Characteristics:**
- Grayscale in the baseline theme; plugin-added color carries state.
- Host tokens through Tailwind utilities or CSS custom properties.
- Flat panels by default; Compose Chat has a scoped soft writing-frame shadow.
- Small host sans-serif type, tabular counts, and larger quota-summary type in full panels.
- Host SDK icons or the vendored `Icon` component; quota uses a current-color battery SVG.

This refresh uses Tasks Plus's vendored controls, GitHub Insight's UI modules, Threads with PRs' sidebar row, Codex Quota's `quota-view.tsx`, and Compose Chat's `app.css`. Committed quota screenshots confirm the dashboard and battery layout, but show a host theme different from the recorded palette. Compose Chat's acceptance report records its approved quiet frame; its screenshots are not included in this checkout. No new live-browser or theme-contrast measurements were made.

## Colors

A host ink-and-canvas ramp supplies neutral structure. Semantic hues carry state; action colors follow the active host theme.

### Primary
- Graphite Primary, `primary`, is neutral in the recorded theme. Links, ready PR badges, board drop lines, and some compact primary buttons use it. Default vendored buttons use `foreground` instead. These roles are not interchangeable in a colored theme.
- On Primary, `primary-foreground`, is paired with `primary` fills, not automatically with `foreground` fills.

### Neutral
- Canvas, `canvas`, is the recorded base for `background`, `card`, and `popover`. Use each surface's semantic alias at runtime.
- Ink, `ink`, supplies primary text through `foreground` and the recorded neutral mixes.
- Muted Foreground, `muted-foreground`, is for metadata, inactive icons, and labels. Subtle Foreground, `subtle-foreground`, is for tertiary timestamps and hints.
- Secondary Fill, `secondary`, and Muted Fill, `muted`, support secondary buttons, tab tracks, and avatars.
- Sidebar Wash, `sidebar`, is the sidebar surface. `ring-sidebar` separates an avatar's status dot from it.
- Recessed Surface, `surface-recessed`, is for sunken placeholders and Compose Chat's inline code.
- Border, `border`, and Hairline, `border-hairline`, separate regions. `input` is the stronger field and hover stroke.
- Hover Veil, `state-hover`, and Active Veil, `state-active`, are transparent overlays for interaction feedback.
- Compose Surface, `compose-surface`, and Compose Message, `compose-message`, are derived from live ink and canvas in Compose Chat alone. They are not general panel backgrounds.

### Status
- Success Green, `success`, means passed, live, or connected. Running review workers may use a pulsing success dot.
- Attention Amber, `attention`, means in progress or awaiting attention, including GitHub Insight's running checks and pending review blockers.
- Warning Orange, `warning`, is for degraded or stale-state fills and icons. Use `warning-text` for warning text on canvas. Codex Quota currently reports stale data with `destructive` text.
- Destructive Red, `destructive`, means failed, blocked, conflicts, or errors. Error banners use a faint destructive fill and stronger destructive border.
- Timeline Blue, `timeline-accent`, marks tasks in review.
- Merged Violet, `merged-violet`, records the light `violet-600` PR tone. Its runtime pair is `dark:text-violet-400`; there is no dedicated merged-state host token in the current source.

### Named rules

**The Color Is State Rule.** Plugin-added hues report state. Decoration and hierarchy use weight and the neutral ramp. Host-supplied action colors remain authoritative, even when the active theme makes them chromatic.

**The Missing Token Rule.** Use a raw Tailwind hue only for a status without a host token, and supply a dark-theme pair. GitHub Insight now uses `attention` and `success` for running and passed checks; its earlier amber and emerald exceptions are gone.

## Typography

Use the host's sans-serif family and system monospace stack. The frontmatter records Inter from the previous host baseline; plugin UI inherits the active host font rather than installing it.

### Hierarchy
- Title uses the recorded body size with semibold weight for section, card, PR, and task titles.
- Body is the compact panel default. The sidebar thread title also sets its size directly to the recorded body size.
- Label is for metadata, pills, compact buttons, and check names.
- Micro is for dense badges and counters, not reading text. Sidebar metadata and urgent counts also use an incumbent intermediate size of 11px.
- Mono is for SHAs, paths, and task keys in code context.
- Codex Quota's full dashboard uses `text-lg` for the page title and `text-4xl` for the allowance summary. These do not establish a narrow-panel heading scale.
- Compose Chat keeps host font sizes and raises timeline paragraph line-height to 1.65 for reading.

On compact coarse-pointer screens, Tasks Plus promotes `text-xs` to `text-sm` and `text-sm` to `text-base`. Its shared icons grow to 20px. Use these helpers instead of freezing desktop dimensions.

### Named rules

**The Tabular Count Rule.** Use `tabular-nums` for changing counts, durations, percentages, and reset countdowns. This is the target convention; some incumbent reset text still lacks the class.

**The Weight Not Size Rule.** In narrow slots, establish headings with medium or semibold weight before increasing size. Reserve the quota dashboard's large number for its full-panel summary.

## Layout

- Spacing follows the host's recorded 4px unit. Common gaps and padding use 6px, 8px, 12px, and 16px steps.
- Plugins fill the host slot. Status rows use flex or grid with `min-w-0` and truncated labels; reading text and errors wrap.
- Codex Quota centers a `max-w-2xl` reading column inside its full panel, with responsive padding and wrapping header/footer controls. This is an inner content width, not a replacement for host panel sizing.
- Tasks Plus's native-style rows use `--bb-sidebar-row-height` and its coarse variant. Threads with PRs instead owns a virtualized two-line list with 48px thread rows, 36px group rows, and 24px child indentation.
- Tasks Plus converts responsive overlays to compact drawers and respects `--bb-drawer-keyboard-inset`.
- Compose Chat retains BB's composer/footer structure, compact-footer hiding, and split-send geometry. Its standalone action targets grow on coarse pointers; the compound send control stays native.

### Named rules

**The Roomy Control Rule.** New standalone controls favor the vendored default height of 36px, at least 12px horizontal padding, and 8px gaps between adjacent targets. Existing compact controls range from 24px to 32px. Preserve compound-control geometry and slot behavior rather than blindly enlarging every button. Tasks Plus's touch helpers generally raise compact controls to 36px and inputs to 40px; Compose Chat's standalone coarse-pointer targets have a 44px minimum.

## Elevation & Depth

Flat is the shared direction. Borders and tonal fills separate regions; host shadows identify menus, dialogs, and dragged cards. The previous host snapshot used a hard bottom edge plus a soft blur. Runtime previews bind to host shadow variables rather than those historical literals.

### Shadow vocabulary
- Float uses `shadow-md` for menus, popovers, selects, tooltips, and dragged cards.
- Dialog uses `shadow-sm` for modal dialogs.
- Compose Chat alone derives a soft writing-frame shadow from `--shadow-color`, falling back to a transparent host-ink mix. Expanded follow-ups have one outer shadow; joined new-thread form/footer siblings split it above and below. Its messages and code blocks remain unshadowed.

### Named rules

**The Floating Layers Only Rule.** New ordinary panel surfaces stay flat at rest. Compose Chat's approved writing frame is a scoped exception, not a new card default. Incumbent Tasks Plus cards, embeds, attachments, and composers, and some GitHub Insight controls and review threads still have rest shadows. Record that drift without copying it into new ordinary panels.

## Shapes

- Host radius is the source. The recorded scale has small inner marks, medium controls and menus, and larger cards, rows, and banners. Runtime styles use utilities or live radius calculations.
- Full rounding is for dots, avatars, and pills.
- Borders are thin host strokes. Dashed borders mark empty or placeholder regions.
- Compose Chat calculates its writing-frame radius as host radius plus 6px and message radius as host radius plus 2px. Its action buttons and code blocks use host radius; inline code uses half of it. The frontmatter records these derived corners only for the baseline theme.

## Components

### Buttons
Plain host controls with neutral structure. Tasks Plus vendors shadcn `Button` with `cva` variants; GitHub Insight also has smaller bespoke action controls.
- Default pairs `foreground` fill with `background` text. Keep at most one filled default action per view. Compact GitHub actions may instead pair `primary` with `primary-foreground`.
- Outline has an `input` border and transparent fill. Ghost uses hover and active veils, including pressed/open state.
- The vendored default is 36px tall; small is 32px, large is 40px, and icon-only is 36px square.
- Shared control transitions ease color changes over 150ms and switch instantly on hover-in. List-row hover has no transition.
- Vendored focus uses a 1px host ring. Bespoke GitHub controls include 2px rings with reduced opacity; Codex Quota uses host-ring outlines. Disabled treatments vary between 50% and 60% opacity.
- Use host SDK icons or the vendored `Icon`; typical desktop icons are 14px to 16px.

### Pills and badges
Neutral pills have a host border, muted text, full rounding, and small padding. Urgent counts use a faint destructive fill, destructive text, and tabular numbers. PR badge tones are merged violet, problem destructive, ready primary, and muted waiting/neutral. Provider and project badges are host identity cues, not plugin branding. Tasks Plus label dots may use user-supplied label colors; these are task data, not a shared palette.

### Status marks
Dots are 6px to 8px in a semantic state color. Running worker dots pulse; spinning or pulsing marks should respect reduced motion. Avatar dots use a sidebar-colored separating ring.

### Cards and containers
Use host `card` fill, border, and larger radius. Interactive cards raise the border to `input` and add the hover veil. Padding ranges from 8px to 14px in existing compact cards. The board's ordinary card still uses a small rest shadow, which is documented drift from the shared flat direction.

Errors use a faint destructive banner with wrapping text and an explicit retry action. Empty states use a dashed border and centered muted copy. Neither pattern should hide the last useful content.

### Inputs / fields
Vendored fields have an `input` stroke, transparent fill, medium radius, muted placeholder, and a 1px focus ring. Height grows from 36px to 40px on compact coarse-pointer screens. GitHub's draft textarea instead uses `background`, content-driven height, a maximum height, and a stronger focus-border/ring treatment.

### Menus and popovers
Use host `popover` fill and foreground, a border, medium radius, small internal padding, and `shadow-md`. Radix-backed primitives inherit host enter/exit animation utilities. Items use the hover veil.

### Threads with PRs row
The virtualized sidebar row has a narrow icon column, a truncating content column, and right-aligned status. Two 20px internal rows fit within the 48px target. It uses host sidebar selection/hover fills, an overlay focus ring, provider identity, PR badge, and urgent count. Grouping and indentation belong to this list, not to every plugin panel.

### Codex Quota battery and dashboard
The footer battery is a current-color SVG with a proportional fill, no threshold hue, and an adjacent tabular percentage. Only fresh quota data fills the battery; stale or unavailable states keep the outline without an asserted percentage. The dashboard uses a large allowance summary, separated window rows, reserved loading space, and a host selector.

### Compose Chat writing frame
A content-script theme treatment, not a replacement editor. It adds a faint surface, hairline border, derived corners, and soft shadow while keeping native editors and controls. The writing field has no new focus outline; action buttons retain a visible 2px host-ring outline. Hover is gated to fine pointers, pressed state uses the active veil, and reduced motion disables its transitions. Native send-menu segments, footer hiding, and picker behavior remain owned by BB. Its DOM hooks are a compatibility boundary, not a public renderer API.

## Do's and Don'ts

### Do:
- **Do** use host tokens through Tailwind utilities or CSS custom properties, including host action colors. Check light, dark, and third-party themes when changing UI; this refresh does not establish a new theme-verification pass.
- **Do** keep plugin-added color for state.
- **Do** use `tabular-nums` on numbers that update.
- **Do** use `state-hover` and `state-active` for new interaction feedback.
- **Do** truncate narrow status labels and let reading text and errors wrap.
- **Do** use the host registry or SDK primitives where available, and preserve native compound-control geometry.
- **Do** keep Compose Chat's derived surfaces, radii, and soft shadow scoped to its writing frame and messages.

### Don't:
- **Don't** hard-code the recorded palette or shadow snapshot into runtime UI. A status without a host token may use a documented light/dark pair.
- **Don't** use a raw Tailwind hue when BB has a token for that state.
- **Don't** put a rest shadow on a new ordinary panel surface; Compose Chat's writing frame is the documented exception.
- **Don't** add a plugin brand color, logo mark, or custom font. Keep provider and project identities intact.
- **Don't** copy the quota dashboard's large summary type into narrow slots.
- **Don't** treat a recorded light-theme sample or a synthetic acceptance measurement as proof of contrast in every host theme.
