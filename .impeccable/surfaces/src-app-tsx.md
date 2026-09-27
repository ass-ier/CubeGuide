---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/AutomaticPhotoInput.tsx","src/components/FaceInput.tsx","src/components/PhotoInput.tsx","src/components/SolutionPanel.tsx","src/styles.css","src/styles/automatic.css","src/styles/photo.css"]
---

# Solver workbench

Mode: Operate.

Scope: src/App.tsx, its components, input flow, and responsive styles.
The user alternates between a physical 3x3 cube and the screen. Success is
correct face entry followed by confident, interruptible physical turns.

Structure: the first screen is a restrained upload workflow, not a marketing
page or a dashboard. One primary action, six compact face slots, and a short
top-edge guide are sufficient. Clear photos require no center selection,
cropping, rotation, review checkbox, or extra solve click. Manual/practice
routes remain secondary. Do not mount the example 3D cube or show mode
toggles, metrics, or the manual form before they are relevant.

After a real cube is read, a large cube sits beside the solution on desktop;
phones use the established vertical workspace and docked move controls.
The secondary manual route retains six interactive face editors and optional
alignment/review. Preserve the daylight slate/blue identity.

Proof is functional: the actual entered cube, runtime-verified snapshots, and
visibly matching layer motion. Preserve the distinction between Solution
ready and a current solved state. No marketing evidence or camera simulation.
Automatic photo input uses actual local decoding, full-frame grid location,
center sampling, calibrated color matching, and physical validation in a
cancellable worker. The user supplies six labeled faces. Ambiguity produces
a retake, not an arbitrary valid reconstruction. Optional alignment/review
still exists, but is never the automatic happy path.

Signature interaction: pause halfway through a turn, inspect it, and reverse
only that unfinished portion without logical/visual drift.

Visual record: DESIGN.md documents the built daylight-workbench direction.
Native capture/upload and automatic six-photo reconstruction are implemented;
arbitrary camera/lighting accuracy and live-video scanning are not claims.
Persistence remains deliberately unimplemented. The bounded visual pass
covers minimal desktop/mobile entry, working photo slots, and the retained
solution workspace without reopening the accepted palette/layout direction.
Functional checks also cover 320px action visibility, focus, retention,
EXIF/perspective uploads, alternate center schemes, and actual solved meshes.
Documentation screenshots use only generated cube/photo data.
