---
name: "AI paddle control and latency HUD"
description: "Jev picks a target zone per request; one request in flight; live latency shown in the HUD"
type: project
---

# AI paddle control and latency HUD

The right paddle is driven by Jev through a decision loop decoupled from
rendering: exactly one request in flight at a time, a new request sent as
soon as the previous answer arrives, 2 s timeout, and no requests outside
active play. Each request asks a `choice` question whose answer is a target
zone (`top`, `upper`, `middle`, `lower`, `bottom`); the paddle glides toward
that zone at a capped speed every frame.

The HUD displays Jev latency live: last value, rolling average over the last
20 calls, a sparkline, and a colored dot (green < 150 ms, orange <= 300 ms,
red above). Latency is measured round-trip with `performance.now()`.

Errors pause the game: 401/403 returns to the key screen, 429 and
network/5xx/timeout retry with exponential backoff, and play resumes
automatically on the next success.

**Why:** Jev latency is 70-500 ms, far slower than 60 fps; zone targeting
keeps movement smooth and turns latency into a natural handicap. The user
explicitly wants live latency in the UI.

**How to apply:** keep the AI loop and latency stats in the AI module; the
renderer only reads them.
