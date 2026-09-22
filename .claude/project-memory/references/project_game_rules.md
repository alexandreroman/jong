---
name: "Game rules"
description: "Match format: 3 rounds, one point per round, all rounds played, total points decide the winner"
type: project
---

# Game rules

A match has exactly 3 rounds. A round lasts until one player (human or
Jev) scores a point. All 3 rounds are always played, even at 2-0, and the
winner is the player with the most total points (3-0, 2-1, 1-2 or 0-3; a
draw is impossible). Serves alternate: round 1 toward the human, round 2
toward Jev, round 3 toward the human. The ball speeds up slightly on each
paddle hit, up to a speed cap.

**Why:** rules chosen by the user during the design.

**How to apply:** match state logic in the game module must follow these
rules exactly; end screens show the per-round breakdown.
