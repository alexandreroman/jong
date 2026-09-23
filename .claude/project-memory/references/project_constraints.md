---
name: "Project constraints"
description: "Zero-backend game: the proxy stays a thin relay; docs/ is local only"
type: project
---

# Project constraints

All game logic runs in the browser. `server.mjs` is a thin relay that
serves the static files and forwards `/api/systemone` to TypeSafe. The
`docs/` directory (design specs, plans) is git-ignored and stays local.

**Why:** the user wants a zero-backend game; the proxy exists only because
the TypeSafe API rejects browser CORS requests (see
[TypeSafe Jev API](typesafe_jev_api.md)).

**How to apply:** keep all game logic client-side; never add logic,
storage, or extra routes to the proxy; never commit files under `docs/`.
