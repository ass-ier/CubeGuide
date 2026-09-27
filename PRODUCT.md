# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Beginners following along with a physical 3x3 Rubik's Cube, and experienced
solvers who want a compact notation-first view. The explicit implementation
brief supplies the product decisions below; no additional audience is assumed.

## Product Purpose

Turn six labeled photos into an automatically read, physically validated,
verified solution that a person can follow one animated move at a time.
Manual entry and assisted photo alignment remain secondary tools.

## Operating Context

The user holds a physical cube next to a desktop, tablet, or phone. Manually
entered or photographed centers establish the reference frame. Front, back,
up, and down must be
unambiguous even when the virtual camera is rotated.

## Capabilities and Constraints

- A minimal photo-first screen: one prominent upload action, six compact
  labeled slots, short orientation guidance, and secondary manual/practice
  routes. No center forms, crop/review requirements, example cube, metrics,
  or mode toggles on the normal automatic entry path.
- Real local full-frame sticker-grid localization, pixel-derived centers,
  six-center calibration, physical validation, and verified solving after
  six clear photos. Playback remains an explicit action.
- Six distinct plausible centers are required; no assumed Up/Front colors,
  forced color-count assignments, invented hidden stickers, or arbitrary
  selection between multiple valid orientation interpretations.
- Bad or uncertain captures receive actionable retake messages. Cancelled
  or failed replacements preserve accepted images. Reset/mode changes and
  removal of a solution use explicit confirmation and stale-work guards.
- Native camera-hint/file input, plus optional manual centers, sticker grids,
  four-corner photo alignment, color review, and guarded per-face merging.
- No app accounts, backend, server photo uploads, analytics, or cloud vision.
  Authorized source publication/static hosting does not change local processing.
- Real two-phase solving in a Web Worker, independent replay verification,
  immutable step snapshots, and impossibility diagnostics.
- An interactive 27-cubelet view with real pausable layer rotations.
- Play, previous, next, restart, seek, speed, and full move notation.
- Random practice scrambles and beginner/advanced presentation.
- Automatic six-photo input is required by the updated scope. Live-video
  scanning and persistence remain outside this implementation.
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
5. Automatic photos need confident pixel evidence and full validation, not
   obligatory setup/review work or convenient guesses.

## Accessibility & Inclusion

Named colors and letter symbols supplement sticker colors. Controls support
keyboard navigation and touch, visible focus, adequate contrast, and reduced
motion. Keyboard cube shortcuts must not intercept focused input controls.
