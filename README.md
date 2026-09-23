# Jong

Pong in the browser, played against an AI opponent driven
by [TypeSafe AI](https://docs.typesafe.ai/models)'s Jev
model. A match is best of 3 rounds: the first player to win
2 rounds wins. Everything runs in the browser on a single
HTML canvas. The only server is a tiny local proxy.

## Features

- **Jev as your opponent** — the AI paddle is steered by
  Jev's typed decisions, fetched live during play
- **Live latency** — Jev response times are shown in the
  game HUD
- **Canvas only** — no UI framework, no build step, no
  npm dependencies
- **Hit feedback** — the ball leaves a short fading trail,
  and a paddle recoils when it strikes the ball
- **Mobile-friendly** — the 800x400 court scales down to
  fit smaller screens, with touch controls: drag a finger
  anywhere on the screen to move your paddle; the game
  pauses automatically when you leave the page (switch
  app, lock the screen)
- **Your key stays in memory** — the TypeSafe API key you
  enter is never stored

## Prerequisites

- [Node.js](https://nodejs.org/) 24 or later
- A TypeSafe AI API key, entered in the game when you play

## Getting Started

From a clone of this repository, start the local server:

```bash
make dev
```

Open the printed URL (`http://localhost:3000/` by
default). The server also prints a `Network` URL: open it
on a phone connected to the same Wi-Fi to play on mobile.

`make dev` restarts the server when its code changes;
reload the page to pick up client-side changes.

## Usage

Run `make` to list every available target:

```bash
make dev     # run the server, restarting on change
make app-up  # run the server without watching
make test    # run the test suite (node --test)
make check   # run tests and syntax checks
```

## Configuration

| Variable           | Description                   | Default                                 |
| ------------------ | ----------------------------- | --------------------------------------- |
| `PORT`             | Port the local server listens | `3000`                                  |
| `TYPESAFE_API_URL` | Upstream URL for Jev requests | `https://api.typesafe.ai/v1/systemone`  |

## How Jev Plays

The game keeps exactly one Jev request in flight and sends
the next one as soon as the answer arrives. Each request
carries the ball position and velocity, both paddles and,
while the ball comes toward Jev, two hints: the time in
seconds until the ball reaches Jev's paddle
(`timeToReachYou`) and the number of top/bottom wall
bounces before then (`wallBounces`). Jev still has to work
out where the ball lands from these hints.

Each request asks two `choice` questions:

- **`target`** — which of ten 40 px zones (`y0-40` to
  `y360-400`, top to bottom) the ball reaches the paddle
  in; the paddle aims at the zone center
- **`aim`** — `up`, `straight` or `down`: where to send
  the ball back, away from the human paddle

The game then shifts the paddle 15 px from the zone center
so the ball hits the side that deflects it in the chosen
direction. The ball lands up to 20 px from the zone center,
so an aimed hit uses 35 px of the 45 px hit tolerance; the
remaining 10 px absorb rounding, wall-clamp drift and
imperfect estimates. In the edge zones (`y0-40` and
`y360-400`), the paddle cannot move its center past y 40
or y 360, so the requested direction may not be reachable.
While the ball moves away, the paddle goes back
to the middle of the court, whatever Jev answers.

## Visual Effects

The ball trail and the paddle recoil live in `src/fx.js`
and never touch the physics: `game.js` only reports which
paddle hit the ball during a step, and the renderer shifts
the paddle drawing by the recoil offset. The effects run on
the frame time, so they look the same at any frame rate,
freeze while the game is paused, and reset whenever the
ball is served again.

The court background is a subtle horizontal gradient,
black at the side edges and a very dark blue-gray
(`#141820`) around the center line. It stays dark enough
for the white paddles, the ball and the text to keep their
contrast, and the dim overlays darken it like the rest of
the court. Texts such as the round banners and the portrait
hint sit directly on the court, with no backing box, so the
gradient stays unbroken.

## Architecture

The TypeSafe API rejects cross-origin requests from
browsers, so `server.mjs` serves the game and relays Jev
calls from the same origin. It forwards only the request
body and the `Authorization` header, and holds no game
logic.

```mermaid
graph LR
    B[Browser: canvas game] -->|GET / and /src/*| S[server.mjs]
    B -->|POST /api/systemone| S
    S -->|POST /v1/systemone| T[TypeSafe API: Jev]
```

| Path          | Description                                    |
| ------------- | ---------------------------------------------- |
| `index.html`  | Page hosting the game canvas                   |
| `src/`        | Browser game code (ES modules)                 |
| `src/fx.js`   | Visual-only effects: ball trail, paddle recoil |
| `server.mjs`  | Static file server and TypeSafe proxy          |
| `test/`       | Tests run with the built-in `node --test`      |

## License

This project is licensed under the Apache-2.0 License —
see [LICENSE](LICENSE) for details.
