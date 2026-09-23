# Project Memory

> When a new decision **contradicts** an existing
> memory note, do NOT silently override it.
> Instead: surface the conflict, quote the
> existing memory, explain how the new decision
> differs, and ask for explicit confirmation
> before updating. **Do NOT take any action** —
> no tool calls, no file writes — until confirmed.

> **Note wording** — state permanent facts in the
> present tense. A note read out of context must
> not reveal what it replaces or what just
> happened. Ban narration markers: "now", "no
> longer", "previously / used to", "reverses /
> replaces", "kept", "changed to", "reintroduce",
> "the user asked to". Phrase prohibitions
> positively ("the API is versioned under /v2"),
> not as the negation of a former state. Test:
> remove the note from its context — if a sentence
> only makes sense knowing the prior state,
> rewrite it.

- [Project constraints](references/project_constraints.md) — zero-backend game, thin proxy, docs/ stays local
- [Game rules](references/project_game_rules.md) — best of 3 rounds of one point each, first to 2 rounds wins
- [AI paddle control and latency HUD](references/project_ai_control.md) — Jev picks a zone + aim, recenters when ball moves away, live latency
- [API key handling](references/project_api_key.md) — key kept in memory only, never persisted
- [Display size and mobile support](references/project_display_mobile.md) — 800x400 max, responsive, touch controls
- [TypeSafe Jev API](references/typesafe_jev_api.md) — endpoint, payload shape, CORS rejected for browsers
- [Environment file](references/project_env_file.md) — single git-ignored .env; no .env.local
- [Makefile as the tooling entry point](references/feedback_makefile_tooling.md) — generic Makefile targets, no sh scripts or tool prefixes
- [Fly.io deployment](references/project_fly_deployment.md) — one machine in lax, deploys pin the image digest (kbld)
