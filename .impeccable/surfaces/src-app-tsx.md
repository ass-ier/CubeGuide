---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/components/FaceInput.tsx","src/components/PhotoInput.tsx","src/components/SolutionPanel.tsx","src/styles.css","src/styles/photo.css"]
---

# Solver workbench

Mode: Operate.

Scope: src/App.tsx, its components, input flow, and responsive styles.
The user alternates between a physical 3x3 cube and the screen. Success is
correct face entry followed by confident, interruptible physical turns.

Structure: a large cube beside a single current task on desktop; a vertical
workspace with docked current-move/playback controls on phones. Six face
editors remain directly interactive, with explicit top/right orientation.

Proof is functional: the actual entered cube, runtime-verified snapshots, and
visibly matching layer motion. Preserve the distinction between Solution
ready and a current solved state. No marketing evidence or camera simulation.
The expanded photo flow uses actual local raster decoding and color sampling,
not a simulated scanner. The user supplies six faces, aligns the sampled
region, corrects the predictions, and explicitly commits each reviewed face.

Signature interaction: pause halfway through a turn, inspect it, and reverse
only that unfinished portion without logical/visual drift.

Visual record: DESIGN.md documents the built daylight-workbench direction.
Native photo capture/upload is implemented as assisted input; arbitrary
camera/lighting reliability and unassisted live scanning are not claims.
Persistence remains deliberately unimplemented. The bounded photo extension
inspection covers desktop/mobile alignment and review without reopening the
accepted baseline design direction.
