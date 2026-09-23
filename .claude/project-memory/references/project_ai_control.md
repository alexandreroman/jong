---
name: "AI paddle control and latency HUD"
description: "Jev picks one of 10 zones plus an aim per request; recenters when the ball moves away; live latency HUD"
type: project
---

# AI paddle control and latency HUD

The right paddle is driven by Jev through a decision loop decoupled from
rendering: exactly one request in flight at a time, a new request sent as
soon as the previous answer arrives, 2 s timeout, and no requests outside
active play. The paddle glides toward its target at a capped speed every
frame.

Each request asks two `choice` questions:

- `target`: one of 10 zones of 40 px (`y0-40` … `y360-400`); the target y
  is the zone center.
- `aim`: `up`, `straight` or `down`, applied as a 15 px paddle offset so the
  ball hits the paddle off-center and leaves at an angle (`up` puts the
  paddle below the ball). Budget: 20 px half-zone error + 15 px offset
  leaves 10 px of the 45 px hit tolerance as slack.

When the ball moves toward Jev, the state includes `timeToReachYou` and
`wallBounces` so Jev can extrapolate the arrival y itself; the predicted
intercept y is deliberately not sent, so the decision stays Jev's. The
state also includes `opponentPaddle` for aiming. When the request state has
the ball moving away, the client sets the target to the court middle
(y 200) and ignores the answer; requests continue so the HUD stays live.

The HUD displays Jev latency live: last value, rolling average over the last
20 calls, a sparkline, and a colored dot (green < 150 ms, orange <= 300 ms,
red above). Latency is measured round-trip with `performance.now()`.

Errors pause the game: 401/403 returns to the key screen, 429 and
network/5xx/timeout retry with exponential backoff, and play resumes
automatically on the next success.

**Why:** Jev latency is 70-500 ms, far slower than 60 fps; zone targeting
keeps movement smooth and turns latency into a natural handicap. Arrival
hints, recentering and aiming make Jev a real opponent without the client
playing for it. The user explicitly wants live latency in the UI.

**How to apply:** keep the AI loop and latency stats in the AI module; the
renderer only reads them. Do not add the predicted intercept y to the
request state.
