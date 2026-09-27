---
name: CubeGuide
description: Minimal automatic photo entry, followed by a daylight cube-solving workbench.
colors:
  primary: "#3552ba"
  primary-hover: "#29439d"
  primary-soft: "#edf1ff"
  ink: "#243247"
  muted: "#5c687b"
  page: "#f8fafc"
  surface: "#ffffff"
  stage: "#edf2f7"
  line: "#dce2eb"
  success: "#176b4d"
  error: "#a62838"
  error-soft: "#fff2f3"
  error-line: "#e7bfc7"
  warning: "#725016"
  warning-soft: "#fff8e9"
  warning-line: "#e5d4a9"
typography:
  heading:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "2rem"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-0.035em"
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  intro:
    fontSize: "1rem"
  panel-heading:
    fontSize: "1.4rem"
  compact-heading:
    fontSize: "1.125rem"
  mobile-heading:
    fontSize: "1.75rem"
  narrow-heading:
    fontSize: "1.55rem"
  supporting:
    fontSize: "0.9375rem"
  label:
    fontSize: "0.8125rem"
  caption:
    fontSize: "0.75rem"
  compact-caption:
    fontSize: "0.6875rem"
  notation:
    fontFamily: 'ui-monospace, "SFMono-Regular", Consolas, monospace'
    fontSize: "5rem"
    fontWeight: 550
    lineHeight: 1
    letterSpacing: "-0.035em"
rounded:
  surface: "16px"
  button: "9px"
  field: "7px"
  sticker: "4px"
spacing:
  small: "8px"
  medium: "16px"
  panel: "24px"
  column: "28px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.button}"
    padding: "11px 16px"
    height: "46px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  task-panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.surface}"
    padding: "26px 24px"
---

# Design System: CubeGuide

## Overview

The built direction remains a **daylight workbench**. Before a cube is read,
the interface recedes to one upload action, six small face slots, a holding
guide, and generous space. Afterward, the actual cube becomes the object of
attention. Slate text and confident blue controls preserve the incumbent
identity; there is no decorative marketing page or dashboard.

This record describes the implemented interface. Product scope and
requirements live in `PRODUCT.md`; screen-specific strategy lives in the
surface brief. The brief explicitly prioritized clear orientation, accessible
entry, a large cube, and straightforward playback.

## Colors

Ink and muted slate text sit on a cool near-white page. White working panels
are separated by fine gray-blue borders. Blue identifies the primary action,
selected paint color, active face, current timeline step, and direction cue.
Success is green only when the underlying state supports that claim.

Sticker colors have semantic meaning, not branding roles. Their exact values
and high-contrast letter inks come from `src/cube/types.ts`. All colored input
is also labeled with a name and W/Y/G/B/R/O symbol. Empty stickers use both
`?` and a striped pattern.

## Typography

Use the native system sans-serif stack for prose and controls. Fixed rem sizes
and tighter product-UI hierarchy are intentional. Reserve monospace for real
move notation, face letters, and diagnostic facelet strings, not general
technical decoration.

The desktop page heading is 2rem and the panel heading approximately 1.4rem.
The current move is 5rem so it is legible next to a physical cube. Body copy
uses 1.6 line height and a maximum 70-character measure; compact operational
labels range from 0.6875rem to 0.8125rem.
Photo estimate/readout labels use at least 0.6875rem, and mobile correction
selects use 1rem to remain legible without focus zoom.

## Layout

Automatic entry uses a 660px content width inside an 820px shell. The heading
and upload action lead, followed by compact thumbnails, collapsed photo tips,
and secondary manual/practice links. The six photo slots are one row on
desktop and two rows of three below 560px. Face names, center names, missing
photos, progress, and retake state do not rely on color alone.

The solution/manual page is capped at 1344px, with 40px desktop side padding. A 1.35:1 workspace
places the cube on the left and the current task on the right. The cube column
sticks within the workspace while a long face-entry form is completed.

At 800px and below, the columns become one capped 600px column. At 520px,
side padding becomes 16px and cube height is 315px. On solution screens,
mobile playback controls and a compact current-move cue dock at the viewport
bottom so they remain usable while watching the cube or reading instructions.
Footer space prevents the dock from covering the page's final content.

Six face editors normally use two columns. Under 359px they become one
column to retain practical sticker targets. Orientation text and native
form fields wrap rather than causing horizontal scrolling.

The default screen has no example cube, center selects, manual sticker grid,
metrics, or mode toggle. The main photo action opens capture/upload directly.
The smaller camera option uses the native device hint; it is not a second
primary action. The viewport is lazy-loaded only when a real cube or the
explicit manual/practice route needs it.

## Elevation & Depth

Panels use border and tonal separation, not generic soft shadows. The four
exceptions have functional depth: the actual rendered cube casts a floor
shadow, the mobile control dock separates from scrolling content, and modal
confirmation dialogs sit above a darkened backdrop, and crop handles stay
distinct from arbitrary photo backgrounds.

## Shapes

Surface corners are 16px; controls use 7-9px; stickers use 4px. The black cube
body and gaps between stickers preserve a physical puzzle silhouette. Do not
turn every paragraph or setting into a nested card.

## Components

Native selects, checkboxes, range inputs, buttons, and dialogs provide familiar
keyboard behavior. Focus uses a visible 3px blue outline with 3px offset.
Disabled controls look inactive but fixed center stickers retain their color.

The palette is sticky within manual entry. Face headings select holding
instructions. Painting changes those instructions only after activation, not
during pointer focus, so layout changes cannot steal a click.

The prominent move, face name/color, physical direction arrow, and actual 3D
layer must agree. An unfinished half-turn rewind is a special physical
direction case; notation alone cannot describe its arrow direction.

Automatic capture uses compact, actual face thumbnails and detected center
names. Focus advances to the next upload action, moves to an actionable error
when needed, and reaches the verified solution without starting playback.
Busy processing is cancellable. Failed/cancelled replacement preserves the
prior thumbnail; destructive resets and source changes remain confirmed.

The secondary alignment editor keeps its four numbered handles, perspective
grid, named color corrections, and required review. Its targets become 44px
on phones. Amber is a request to inspect an estimate, not an accuracy score.
This editor is an escape hatch, never compulsory for clear automatic photos.

Inherited native fonts, fixed compact type steps, and semantic sticker/status
colors are contextually intentional. The new screen uses the same documented
2rem/1.75rem/1.55rem heading steps and slate/blue palette. These hook findings
do not justify a redesign or advisory suppression; no warnings are suppressed.

## Do's and Don'ts

- Do keep Up/Front orientation visible and independent of the camera.
- Do make missing input, invalid pieces, loading, and paused states explicit.
- Do preserve all named controls on mobile, including the turn guide.
- Do use reduced motion for exact timed snapshots instead of rotation.
- Don't label a verified move sequence as an already solved current cube.
- Don't imply the two-phase solution is optimal.
- Don't add accounts, unsupported camera-accuracy claims, fabricated proof, or
  decorative metrics to this task-focused workbench.
