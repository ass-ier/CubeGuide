# CubeGuide

A complete, local-first 3x3 Rubik's Cube solver and step-by-step teaching tool.
Enter the six faces of a physical cube manually or with locally analyzed face
photos, validate its pieces, and follow a real, verified solution on an
interactive 27-cubelet model.

## Run locally

Use Node.js 20.19 or newer (Node 20.19.2 and npm 11.4.2 were used for development).

```sh
npm ci
npm run dev
```

Open **http://127.0.0.1:5187/**. The server listens only on loopback and uses a
strict port: it fails rather than silently switching to another app's port.
Stop it with Ctrl+C in its terminal.

For a production build:

```sh
npm run build
npm run preview
```

The production preview is **http://127.0.0.1:4187/**. Serve `dist/` over HTTP;
opening `index.html` directly with `file://` does not support the module worker.
There is no backend, account, API key, or remote deployment. Photo processing
and solving stay in your browser; the native photo picker is optional.

## Solve your physical cube

1. Choose a face to be **Front** and an adjacent face to be **Up**. Select all
   six center colors. Nothing assumes that white must be Up or green Front.
2. Lock the centers. Select a named paint color, then click or tap the other
   48 stickers in the six face grids. `?` and a striped background mean empty,
   not white. Every sticker also has a color letter. Alternatively, choose
   **Take/upload face photos** and follow the reviewed-photo flow below.
3. Use each face heading for its holding instructions. The labels above and
   below each grid identify the neighboring **top** and **right** center.
   Always look straight at the face; do not mirror a back-face entry.
4. Select **Check colors & solve**. Incomplete or impossible input receives
   specific diagnostics. No move sequence is accepted until replay solves
   the exact entered state.
5. **Solution ready** means the moves have been verified; your current cube
   is still scrambled. Press **Play solution**, or follow one **Next** move
   at a time. **Cube solved** only appears when the current committed cube
   really is solved and no turn is in flight.

The initial 3D view is an explicitly labeled orientation reference, not a live
preview of incomplete or invalid stickers. A valid entry replaces it when
submitted. Camera rotation never changes the chosen Up/Front reference frame.

### Face entry reference

These labels name the center beyond an edge of the face you are looking at.
They are not instructions to rotate a layer.

| Face being entered | Top edge | Right edge | Bottom edge | Left edge |
| --- | --- | --- | --- | --- |
| Front (F) | U | R | D | L |
| Right (R) | U | B | D | F |
| Back (B) | U | L | D | R |
| Left (L) | U | F | D | B |
| Up (U) | B | R | F | L |
| Down (D) | F | R | B | L |

For **Back**, turn the whole cube halfway around vertically, keeping Up on top.
Right is now on the left side of the view, and Left on the right.

For **Up**, tilt the whole cube toward you: Back is beyond the top of the grid,
Front beyond the bottom. For **Down**, tilt it away: Front is beyond the top,
Back beyond the bottom. Return to your original Up/Front orientation before
finding the next face.

### Take or upload six face photos

After choosing and locking your own center colors:

1. Open **Take/upload face photos**. Capture Front, Right, Back, Left, Up, and
   Down separately. A single arbitrary picture cannot reveal all 54 stickers.
   The selected face's center and neighboring top/right colors stay explicit;
   **How to hold this face** gives the same orientation as manual entry.
2. Choose **Take a photo** or **Upload photo**. Take a photo uses the native
   `capture="environment"` file-input hint. Camera-capable devices may open
   their camera; others may show a picker. If access is denied/unavailable,
   upload an existing image or use the manual grids.
3. Rotate the image upright, then drag the four numbered corners to the
   outside corners of that face's nine stickers, clockwise from top-left.
   The projected 3x3 overlay must follow the actual sticker rows. Arrow keys
   adjust a focused corner by one image pixel; Shift uses ten pixels.
4. Select **Detect nine colors**. The app samples the sticker interiors and
   estimates their named colors. Correct the eight non-center estimates,
   check the actual center, and confirm **I checked all nine colors**.
   Uncertain, dark, mixed, or center-mismatched samples require attention.
   A mismatched/uncertain center needs separate acknowledgment; it is never
   silently substituted for your configured fixed center.
5. **Use reviewed face** writes only that face to the normal sticker draft
   and advances to a face still needing entry. Replacing existing colors
   requires confirmation. Repeat until all six faces are entered, then
   **Check colors & solve** runs the same physical validator and real solver
   as manual input. Photo estimates never bypass validation.

Use diffuse, even light, avoid flash/glare, and show one complete face with
visible sticker boundaries. This is **assisted estimation, not automatic
scanning**: even unflagged colors can be wrong, especially red/orange/yellow
under unusual lighting. Review the physical cube, not just the estimates.
Any face or sticker can still be entered/corrected manually.

JPEG, PNG, and WebP still images are supported, up to **16 MiB**, **24 million
source pixels**, and **8192 pixels on either edge**. Convert HEIC/HEIF first.
SVG, GIF, and animated PNG/WebP are rejected. Headers and bounds are checked
before decoding. Images are reduced to at most 1024 pixels per edge, then
sampled through a perspective-correct four-corner mapping using median RGB
samples and exposure-normalized CIELAB matching. Confident, reviewed center
samples can supplement that session's reference colors.

Photos and previews remain local, in memory: no server uploads, browser
storage, external recognition API, or live camera stream. Cancelling the
picker keeps the current review and entered colors. Failed replacements keep
the previous photo; abandoning/replacing a review, resetting, or entering the
solver invalidates pending work and releases its local preview URL. A
20-second decode timeout is explicit and leaves your cube unchanged.

## Playback and practice

- **Play / Pause / Resume:** pause freezes even a partially turned layer.
  Nothing completes in the background while paused. Switching to a hidden tab
  pauses playback; resuming is explicit.
- **Next:** complete exactly one move. During an unfinished undo, it returns
  to that undo's starting position.
- **Previous:** animate the inverse of the last completed move. During an
  unfinished forward turn, reverse only the unfinished portion without a snap.
  A reversed partial half-turn has a counter-clockwise indicator even though
  its algebraic notation remains `R2`, `L2`, etc.
- **Restart / timeline / scrubber:** cancel any active transition and use an
  exact immutable snapshot. Selecting move 7 means the state *after* move 7.
- **Speed:** 0.25x, 0.5x, 1x, 1.5x, or 2x; changes apply to the current turn
  without changing its progress.
- **Camera:** mouse or touch orbit, wheel or pinch zoom, exact face presets,
  and Reset view. A flat six-face view is also available.
- **Beginner / Advanced:** detailed physical instructions or a compact
  notation-oriented presentation. On small screens the move cue and playback
  controls stay docked beside the visible cube viewport.
- **Practice:** Try a scramble generates a fresh 25-move legal random sequence.
  The solver receives only the resulting state, never the scramble history.
  Advanced practice adds all 18 direct face-turn buttons.
- **Reset / Edit:** destructive changes require confirmation. Editing a
  solution restores its original entered colors, not a partially played state.

An animation time estimate includes turn durations and the short pause between
moves at the selected speed. It is **not** a prediction of human solve time.
The move count counts each half-turn once. QTM counts it as two quarter turns.
The two-phase solver produces valid solutions, **not guaranteed shortest ones**;
even a simple position can receive a longer solution.

### Keyboard

When the page itself is focused:

| Key | Action |
| --- | --- |
| Space | Play, pause, or resume a solution |
| Left / Right arrow | Previous / next |
| Home | Restart |
| U, R, F, D, L, B | Direct face turn in Advanced practice |
| Shift + face key | Inverse direct turn |
| Hold 2 + face key | Double direct turn |

These shortcuts do not intercept typing or focused buttons, links, selects,
sliders, editable content, or dialogs. All controls are also natively
keyboard-accessible. A paused manual turn always exposes **Resume turn**,
including after cancelling a New cube dialog or hiding the tab.

**Reduce motion** follows the system preference initially and can be changed.
It replaces rotating transitions with timed, exact state changes; the same
pause, stepping, seeking, and speed controls continue to work.

## Validation and correctness

The validator checks:

- exactly 54 recognized stickers and nine of every named color;
- six distinct fixed centers defining the entered scheme;
- all 12 edges and eight corners, each appearing exactly once;
- ordered corner chirality (mirrored corners are invalid);
- even total edge flips, balanced corner twists, and matching permutation parity.

Piece errors name their colors and affected locations when known. Global
orientation/parity errors explicitly avoid inventing a single offending piece.
Custom distinct center schemes are allowed; conventional opposite-color pairs
are not hardcoded. As with a physical cube, all input must use one consistent
reference frame.

The application's own engine is independent of the solver library. It keeps
immutable corner/edge permutations and orientations as the authoritative
state. Facelets and rendered stickers are derived from that state. Singmaster
transformations are generated from exact integer sticker geometry.

`cubejs` implements Kociemba's two-phase search. Its table initialization,
search, and first verification run in a Web Worker. The main thread validates
the response and independently replays it against the original request again,
producing a deeply frozen snapshot for every step. Changing input cancels and
terminates in-flight work; request generations ignore late responses. Worker
loading failures and a two-minute timeout surface retryable errors.

The renderer never commits logical state. It displays the committed cube plus
a transition progress value. Every frame begins with exact lattice positions,
not previously rotated coordinates. At completion the reducer commits the
next snapshot and the meshes return to exact axis-aligned transforms.

## Tests

```sh
npm run typecheck
npm test

# First-time browser setup:
npx playwright install chromium
npm run test:e2e
```

Vitest covers all 18 moves against an independent engine, four-turn and inverse
identities, conversions, 200 seeded scramble round-trips, color/center entry,
impossible states, worker cancellation/failure, immutable verification, physical
direction cues, and deterministic playback interruptions. Photo tests cover
color/lighting changes, actual perspective-distorted rasters, rotations,
review and fixed-center guards, unsupported/oversized/animated inputs, and
six-photo reconstruction with standard and alternate center schemes.

Each full unit run performs **160 real solver cases**: 120 deterministic
25-40-move scrambles entered through color mapping, 24 fresh cryptographically
random scrambles, and 16 random cubie states from the independent library with
no scramble history. These are solver tests, not inverse-scramble stand-ins.

The Playwright suite uses the actual browser UI and worker. It covers complete
manual input, random solving, every playback control, all 18 signed layer
animations, partial half-turn reversals, camera views, failures/cancellation,
reset confirmation, keyboard handling, mobile touch, and reduced motion.
The photo suite uploads actual generated PNG, JPEG, and WebP files for all six
faces, moves the crop handles, checks the estimates and saved entry, solves
that cube in the worker, and plays to a matching solved logical/visual state.
It also checks corrections, center mismatch, overwrite protection, rotation,
picker cancellation, corrupt/blank files, stale loading, preview cleanup, and
mobile entry. Fixtures include image noise and an exposure gradient; they
are not evidence of camera-hardware or uncontrolled real-world accuracy.
Assertions inspect actual sticker meshes and their transforms, not just
success text. The visibility interruption test explicitly simulates the
Page Visibility event; mobile gestures run in touch-enabled Chromium.

The suite starts its own server unless a server already responds on 5187.
Every test verifies the CubeGuide title and scene identity, so a different
application cannot silently satisfy it. Failure traces are in `test-results/`.
The complete playback case also attaches JSON synchronization evidence.

To smoke-test the built worker and assets, run `npm run preview` in another
terminal after building, then:

```sh
CUBE_GUIDE_BASE_URL=http://127.0.0.1:4187 npm run test:e2e -- --grep 'random scramble ->|six real raster uploads'
```

## Source map

| Area | Principal files |
| --- | --- |
| Typed cube engine | `src/cube/types.ts`, `model.ts`, `geometry.ts`, `moves.ts`, `notation.ts`, `scramble.ts` |
| Physical validation | `src/cube/validation.ts` |
| Solver boundary | `src/cube/solver/solve.ts`, `solver.worker.ts`, `client.ts`, `protocol.ts`, `verification.ts` |
| Playback and direction | `src/cube/animation/playback.ts`, `cue.ts`, `src/hooks/usePlayback.ts` |
| 3D model and camera | `src/cube/rendering/CubeScene.ts`, `src/components/CubeViewport.tsx` |
| Input providers and manual entry | `src/input/provider.ts`, `orientation.ts`, `src/components/FaceInput.tsx` |
| Guided local photo entry | `src/components/PhotoInput.tsx`, `src/input/photo/{decode,load,geometry,analysis}.ts`, `src/styles/photo.css` |
| Teaching interface | `src/App.tsx`, `SolutionPanel.tsx`, `PracticePanel.tsx`, `CubeNet.tsx`, `Dialogs.tsx` |
| Tests | `tests/unit/`, `tests/e2e/app.spec.ts`, `tests/e2e/photo.spec.ts` |
| Product/design context | `PRODUCT.md`, `DESIGN.md`, `.impeccable/` |

Runtime dependencies: React 19.2, React DOM 19.2, Three.js 0.180, and cubejs
1.3.2. Development tooling: TypeScript 5.9, Vite 6.4, Vitest 3.2, and
Playwright 1.56. Exact resolutions are recorded in `package-lock.json`.

For local debugging, the read-only `window.__cubeGuide.inspect()` returns
logical facelets, verified snapshots, playback state, and geometric scene
diagnostics. Rendered facelets are reconstructed from actual mesh positions,
orientations, and sticker colors. This API has no mutation or solver shortcuts.

## Deliberate limitations

- **Photo input is assisted, not fully automatic.** Six photos, user-aligned
  corners, and explicit color review are required. Native camera capture is a
  browser/device hint, not a guaranteed camera UI; physical camera hardware
  and arbitrary lighting have not been certified. There is no live-video
  scanner or reconstruction of unseen stickers. `CubeInputProvider` remains
  the boundary for any future input source.
- **No persistence.** Refreshing closes the current session state. Reset/new
  cube actions within the app warn before discarding meaningful work.
- Standard six-color 3x3 cubes only; no picture-cube center orientation,
  higher-order cubes, whole-cube rotation notation, or wide/slice turns.
- Direct layer manipulation uses buttons and keys, not drag-to-turn gestures.
  Dragging the 3D view moves the camera.
- WebGL and a modern browser are required for 3D. A graphics failure is
  explicitly reported; the written instructions and flat face view remain
  usable. Chromium desktop/mobile emulation is automated; real iOS Safari and
  Android devices have not been independently certified.
