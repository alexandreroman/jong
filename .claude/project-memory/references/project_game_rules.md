---
name: "Game rules"
description: "Match format: best of 3 rounds of one point each; first to win 2 rounds wins"
type: project
---

# Game rules

A match is best of 3 rounds. A round lasts until one player (human or
Jev) scores a point. The first player to win 2 rounds wins the match, and
the match ends at once: a 3rd round is played only at 1-1 (final scores
2-0, 2-1, 1-2 or 0-2). Serves alternate: round 1 toward the human, round
2 toward Jev, round 3 toward the human. The ball speeds up slightly on
each paddle hit, up to a speed cap. The in-game HUD shows
"Round N · Best of 3".

**Why:** rules chosen by the user.

**How to apply:** match state logic in the game module must follow these
rules exactly; the match-over screen shows the winner and the final
score.
