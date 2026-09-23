---
name: "AI paddle control and latency HUD"
description: "Jev picks a zone plus an aim per request; recenters when the ball moves away; live latency HUD"
type: project
---

# AI paddle control and latency HUD

The right paddle is driven by Jev through a decision loop decoupled from
rendering: exactly one request in flight, at least 50 ms between requests,
a 2 s timeout, and no requests outside active play. Each request asks Jev
for a target zone and an aim; the paddle glides toward the target at a
capped speed.

The request state gives Jev arrival hints (`timeToReachYou`,
`wallBounces`) but never the predicted intercept y, so the decision stays
Jev's. When the ball moves away, the client recenters the paddle and
ignores the answer; requests continue so the latency HUD stays live.

Errors pause the game: 401/403 returns to the key screen, 429 and
network/5xx/timeout retry with exponential backoff, and play resumes
automatically on the next success.

**Why:** Jev latency is 70-500 ms, far slower than 60 fps; zone targeting
keeps movement smooth and turns latency into a natural handicap. The user
explicitly wants live latency in the UI.

**How to apply:** keep the AI loop and latency stats in the AI module; the
renderer only reads them. Do not add the predicted intercept y to the
request state.
