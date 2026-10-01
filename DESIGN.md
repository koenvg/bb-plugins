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
---

# Design System: BB plugins

## Overview

**Creative North Star: "The Quiet Instrument"**

Plugin UI is a grayscale instrument panel that lives inside BB. Ink on canvas does almost all the work. Hierarchy comes from weight, size, and the muted/subtle foreground steps, not from color. Color appears only when it carries state: a check passed, a task is in progress, a PR is blocked. When nothing needs the user, the plugin is quiet.

The plugins do not own a palette. Every color, radius, shadow, and font comes from the BB host through CSS custom properties and the host's Tailwind build. The values in the frontmatter are BB's light theme (desktop v0.43.x), recorded so that agents can reason about contrast. Code must reference the token (`text-muted-foreground`, `bg-state-hover`, `var(--canvas)`), never the literal value. This keeps each plugin correct in dark mode and in third-party themes such as Liquid Glass.

Each plugin may add a small accent of its own: status marks, count pills, a signature row or card shape, or small motion. These accents sit on top of the native structure and must not replace it. Direction for new controls is calm and roomy: generous padding and comfortable hit areas, inside BB's type scale.

**Key Characteristics:**
- Grayscale by default; color only for state.
- Host tokens only, read through Tailwind classes or `var(--token)`.
- Flat surfaces; hairline borders and tonal fills define structure.
- Inter at 13px body, tabular numbers for counts and times.
- Hugeicons at 14px to 16px through the vendored `Icon` component.

## Colors

A neutral ink-and-canvas ramp built with `color-mix`, plus a small set of hue tokens that each mean one state.

### Primary
- **Graphite Primary** (`primary`): the strongest neutral. Default buttons (as `bg-foreground`), the focus ring (`--ring` maps to it), active indicators such as the board drop line, "ready" PR badges, links.

### Neutral
- **Canvas** (`canvas`): the base surface for panels, cards, popovers, and dialogs. `background`, `card`, and `popover` all map to it.
- **Ink** (`ink`): primary text. Every neutral fill is a percentage of ink mixed into canvas, so neutrals stay in step across themes.
- **Muted Foreground** (`muted-foreground`): the main secondary text color. The most used color class in the repo. Metadata, labels, inactive icons.
- **Subtle Foreground** (`subtle-foreground`): tertiary text. Timestamps and hints that sit under muted text.
- **Secondary Fill** (`secondary`) and **Muted Fill** (`muted`): quiet backgrounds for secondary buttons, tab tracks, avatars.
- **Sidebar Wash** (`sidebar`): the sidebar surface. Use `ring-sidebar` to cut a status dot out of an avatar.
- **Recessed Surface** (`surface-recessed`): sunken placeholder areas, for example an empty task embed.
- **Border** (`border`) and **Hairline** (`border-hairline`): structure lines. `input` is the stronger stroke for fields and for hover on bordered controls.
- **Hover Veil** (`state-hover`) and **Active Veil** (`state-active`): transparent ink overlays for hover and pressed/open/selected. They work on any surface.

### Status
- **Success Green** (`success`): passed, live, connected. Also the pulsing "worker running" dot.
- **Attention Amber** (`attention`): in progress, needs a look soon.
- **Warning Orange** (`warning`, text: `warning-text`): degraded or stale state. Use `warning-text` for text on canvas; `warning` is for fills and icons.
- **Destructive Red** (`destructive`): failed, blocked, conflicts, errors. Tint as `bg-destructive/5` to `/15` with `border-destructive/40` for error banners.
- **Timeline Blue** (`timeline-accent`): in review.
- **Merged Violet** (`merged-violet`, Tailwind `violet-600` / dark `violet-400`): PR merged. BB has no token for this state.

### Named Rules

**The Color Is State Rule.** A hue appears only when it reports a state. Decoration, emphasis, and branding use weight and the neutral ramp.

**The Missing Token Rule.** Raw Tailwind hues are allowed only for a status that BB has no token for, and always with a `dark:` pair. When a host token exists for the state, use it. Today `text-amber-500` (running checks, banner alerts) and `text-emerald-500` (passed checks) in GitHub Insight duplicate `attention` and `success`.

## Typography

**Body Font:** Inter Variable (with Inter, sans-serif), from the host.
**Mono Font:** the system monospace stack, from the host.

**Character:** one neutral sans at small sizes. Weight carries hierarchy; size barely moves.

### Hierarchy
- **Title** (600, 13px `text-sm`, 1.43): section and card titles, PR title, task title in lists.
- **Body** (400, 13px `text-sm`, 1.43): default panel text. The sidebar row title uses 13px set directly.
- **Label** (500, 12px `text-xs`, 1.33): metadata, pills, small buttons, check names.
- **Micro** (500, 10px `text-2xs`, 1.4): counters and dense badges only.
- **Mono** (400, 12px, `font-mono`): commit SHAs, file paths, task keys in code context.

On coarse pointers at 767px or less, the host raises the scale (xs 14px, sm 15px, base 16px). Use the scale classes so plugins follow.

### Named Rules

**The Tabular Count Rule.** Every number that can change (counts, durations, quota, reset countdowns) uses `tabular-nums`, so the layout does not jump on update.

**The Weight Not Size Rule.** Make a heading with weight (500 or 600) before you make it larger. Panels live in narrow slots; large type breaks them.

## Layout

- Spacing is the host's 4px unit (`--spacing: 0.25rem`). Common steps: `gap-1.5`, `gap-2`, `px-3`, `py-2`.
- Rows are flex with `items-center`, `min-w-0`, and `truncate` on the label, so narrow slots cut text instead of wrapping.
- Plugins fill host slots (sidebar list, right-panel tab, footer, full panel). They never set their own page width; the slot decides.
- Sidebar rows use the host row height (`--bb-sidebar-row-height`, and the `-coarse` variant on touch).
- Tasks Plus switches overlays to a bottom drawer on compact viewports and respects `--bb-drawer-keyboard-inset`.

### Named Rules

**The Roomy Control Rule.** New controls favor comfortable padding and hit areas: default button height 36px, `px-3` or more inside cards, at least 8px between adjacent targets. Dense status lists may stay compact; interactive controls may not. Many incumbent controls are compact (`h-7`, `h-8`); move them up when you touch them.

## Elevation & Depth

Flat by default. Hairline borders and tonal fills (`secondary`, `muted`, `surface-recessed`) separate regions. Shadows mark layers that float above the page and nothing else. Host shadows use a 2px hard bottom edge plus a soft blur.

### Shadow Vocabulary
- **Float** (`shadow-md`): menus, popovers, selects, context menus, and a card while it is dragged.
- **Dialog** (`shadow-sm`): modal dialogs.

### Named Rules

**The Floating Layers Only Rule.** A surface at rest has no shadow. Tasks Plus board cards, task embeds, and the comment composer use `shadow-2xs` at rest today; remove it when you touch them.

## Shapes

- Radius comes from host `--radius` (8px): `rounded-lg` 8px for cards, rows, and banners; `rounded-md` 6px for buttons, inputs, menus, tooltips; `rounded-sm` 4px for small inner marks.
- `rounded-full` is for status dots, avatars, and pills only.
- Borders are 1px `border-border`. Dashed borders mean empty or placeholder.

## Components

### Buttons
Calm, plain, and quiet until pressed. Vendored shadcn "new-york" `Button` with `cva` variants.
- **Shape:** gently rounded (6px).
- **Default:** ink fill, canvas text (`bg-foreground text-background`). One per view at most.
- **Outline:** 1px `input` border, transparent fill.
- **Ghost:** no fill; `state-hover` on hover, `state-active` when pressed, open, or `aria-pressed`. The most common button in panels.
- **Destructive, Secondary, Link:** available; use rarely.
- **Hover / Focus:** color transition 150ms, instant on hover-in (`duration-150 hover:duration-0`). Focus is a 1px `ring` (`focus-visible:ring-1`).
- **Icons:** 16px inside buttons, through the `Icon` component.

### Pills and Badges
- **Neutral pill:** `rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground`. PR state, review state, labels.
- **Urgent count:** `rounded-full bg-destructive/10 px-1.5 text-[11px] font-medium tabular-nums text-destructive`.
- **PR badge tones:** merged violet, problem destructive, ready primary, waiting and neutral muted.

### Status Marks
- 6px to 8px `rounded-full` dots in a status token. A live worker dot pulses (`animate-pulse bg-success`).
- Status icons are 14px (`size-3.5`) in the matching token.
- A dot on an avatar uses `ring-2 ring-sidebar` to cut it out of the background.

### Cards and Containers
- **Corner Style:** 8px.
- **Background:** `bg-card` (canvas).
- **Border:** 1px `border-border`; hover raises it to `border-input` and adds `state-hover`.
- **Internal Padding:** 8px to 14px.
- **Error banner:** `rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm`.
- **Empty state:** `rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground`.

### Inputs / Fields
- **Style:** 1px `input` stroke, transparent fill, 6px radius.
- **Focus:** border stays, 1px `ring`. Containers with a field inside use `focus-within:border-input focus-within:ring-1`.

### Menus and Popovers
- `rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md`, Radix primitives, enter and exit animations from the host.
- Items use `state-hover` on hover.

### Threads with PRs row (signature)
Two-line grid row: `grid-cols-[1rem_minmax(0,1fr)_auto]`, rows 20px each, `rounded-lg px-2`. Status icon in the first column, title (13px) and subline stacked in the middle, PR badge and urgent count on the right. Selected row uses the host sidebar accent. Focus ring draws on an `after:` overlay so the whole row is one target.

## Do's and Don'ts

### Do:
- **Do** use host tokens through Tailwind classes or `var(--token)`. Test every surface in light, dark, and Liquid Glass.
- **Do** keep color for state. Grayscale everything else.
- **Do** use `tabular-nums` on every number that updates.
- **Do** use `state-hover` and `state-active` for interaction feedback instead of custom fills.
- **Do** truncate labels with `min-w-0 truncate` so narrow slots cut, not wrap.
- **Do** pull new primitives from the `@bb` shadcn registry (`components.json`) before writing your own.

### Don't:
- **Don't** hard-code a color value. Literal `oklch` or hex in plugin code breaks themes.
- **Don't** use a raw Tailwind hue when BB has a token for that state.
- **Don't** put a shadow on a surface at rest.
- **Don't** add a plugin brand color, logo mark, or custom font. The accent budget is status marks, count pills, a signature row or card shape, and small motion.
- **Don't** grow type to make hierarchy in a narrow slot. Use weight.
