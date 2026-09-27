---
name: CubeGuide
description: A daylight workbench for learning one physical cube turn at a time.
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

The built direction is a **daylight workbench**: the cube is the object of
attention, and the interface stays readable beside a physical puzzle on a
desk. Expression comes from the real six-color cube, generous working space,
and confident blue controls rather than decorative dashboard elements.

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

The page is capped at 1344px, with 40px desktop side padding. A 1.35:1 workspace
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

Photo entry extends the same workbench rather than opening a separate
dashboard. Six face progress buttons, the configured center, and neighboring
edge colors precede the image. Four numbered crop handles and a projected
3x3 grid make the sampled region explicit. Handle targets become 44px on
phones; dragging a handle does not scroll, while swiping the image can.
The nine-cell review uses named native color selects and clear uncertainty
text. Amber is a semantic request to review, not a confidence percentage.
Center disagreements receive the existing red error treatment. No predictions
are presented as confirmed input until the explicit review action.

The bounded photo visual pass retained the accepted layout and palette. Its
fixes enlarged small estimate labels and touch handles, restored image-area
scrolling, and reused the existing blue notice colors. Design-hook reports on
the inherited compact type steps and semantic sticker/status colors are
contextually intentional, not grounds for redesigning the accepted baseline.
No hook warnings were suppressed.

## Do's and Don'ts

- Do keep Up/Front orientation visible and independent of the camera.
- Do make missing input, invalid pieces, loading, and paused states explicit.
- Do preserve all named controls on mobile, including the turn guide.
- Do use reduced motion for exact timed snapshots instead of rotation.
- Don't label a verified move sequence as an already solved current cube.
- Don't imply the two-phase solution is optimal.
- Don't add accounts, unverified automatic scanning claims, fabricated proof, or
  decorative metrics to this task-focused workbench.
