---
name: "Project constraints"
description: "Founding constraints of Jong: browser-only game, Canvas only, English UI, local proxy, Apache-2.0"
type: project
---

# Project constraints

Jong is a Pong game that runs entirely in the browser. Rendering uses
HTML Canvas only (no DOM UI framework), and every text shown to the player
is in English. The code is vanilla JavaScript ES modules with no build step.

The only server-side piece is `server.mjs`, a dependency-free local Node
proxy that serves the static files and relays `/api/systemone` to TypeSafe.
It holds no game logic and stores nothing. The project is licensed under
Apache-2.0. The `docs/` directory (design specs, plans) is git-ignored and
stays local.

**Why:** the user wants a zero-backend game; the proxy exists only because
the TypeSafe API rejects browser CORS requests (see
[TypeSafe Jev API](typesafe_jev_api.md)).

**How to apply:** keep all game logic client-side; never add logic,
storage, or extra routes to the proxy; never commit files under `docs/`.
