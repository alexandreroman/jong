---
name: "Display size and mobile support"
description: "Court is 800x400 logical max, scales down responsively; mobile touch controls are required"
type: project
---

# Display size and mobile support

The court uses a fixed 800x400 logical coordinate system. On screen it is
at most 800x400 CSS pixels and scales down (keeping the 2:1 ratio, fitting
both width and height) on smaller screens, rendered with
`devicePixelRatio` for sharpness and recomputed on resize and orientation
change.

The game must work on mobile: the player's paddle follows a finger anywhere
on the screen, including the page margins outside the canvas (a touch that
starts on a control does not grab the paddle), a tap replaces Space, tapping
the key field focuses
a hidden `<input>` to open the soft keyboard, and portrait mode shows a
non-blocking "Rotate your device" hint. The proxy listens on `0.0.0.0` and
prints its LAN URL so a phone on the same network can play.

**Why:** explicit user requirements.

**How to apply:** physics never depends on screen size; every input action
has both a keyboard and a touch path, except pause: on touch devices the
game pauses automatically when the page becomes hidden (app switch, screen
lock), with no on-screen pause button.
