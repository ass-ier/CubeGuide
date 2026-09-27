# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Beginners following along with a physical 3x3 Rubik's Cube, and experienced
solvers who want a compact notation-first view. The explicit implementation
brief supplies the product decisions below; no additional audience is assumed.

## Product Purpose

Turn six manually entered or photo-assisted faces into a physically validated,
verified solution that a person can follow one animated move at a time.

## Operating Context

The user holds a physical cube next to a desktop, tablet, or phone. Entered
centers establish the reference frame. Front, back, up, and down must be
unambiguous even when the virtual camera is rotated.

## Capabilities and Constraints

- Complete manual sticker entry and local six-face photo estimation/review;
  no accounts, backend, server uploads, or publishing.
- Native camera-hint/file input, perspective alignment, rotation, named color
  corrections, fixed-center checks, and explicit commit/overwrite protection.
- Real two-phase solving in a Web Worker, independent replay verification,
  immutable step snapshots, and impossibility diagnostics.
- An interactive 27-cubelet view with real pausable layer rotations.
- Play, previous, next, restart, seek, speed, and full move notation.
- Random practice scrambles and beginner/advanced presentation.
- Photo assistance is required by the user's expanded scope. Unassisted
  live-video scanning and persistence remain outside this implementation.
- Two-phase solutions are valid, not guaranteed optimal.

## Evidence on Hand

The user's full implementation specification is the source of requirements.
The app can demonstrate its own verified cube states. There are no supplied
brand assets, testimonials, performance benchmarks, or marketing claims.

## Product Principles

1. A solution is not ready until replay proves that it solves the original cube.
2. One logical state drives every representation and control.
3. Physical orientation is more important than decorative interface elements.
4. A learner can stop, inspect, undo, or restart without losing synchronization.
5. A photo prediction is not an entered color until the user reviews it.

## Accessibility & Inclusion

Named colors and letter symbols supplement sticker colors. Controls support
keyboard navigation and touch, visible focus, adequate contrast, and reduced
motion. Keyboard cube shortcuts must not intercept focused input controls.
