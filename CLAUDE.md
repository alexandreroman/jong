# Jong

Browser Pong game where the opponent paddle is driven by
TypeSafe AI's Jev model, played in 3 rounds.

See [README.md](README.md) for full documentation.

## Tech stack

- Vanilla JavaScript (ES modules), no build step, no
  runtime dependencies
- HTML Canvas only for rendering (all UI text in English)
- Dependency-free Node.js server (`server.mjs`): serves
  static files and proxies `/api/systemone` to
  `https://api.typesafe.ai/v1/systemone` (the TypeSafe API
  rejects browser CORS requests)
- Tests with the built-in `node --test` runner

## Build & run

```bash
make dev     # server on http://localhost:3000, restarts on change
make test    # node --test
make check   # tests + node --check syntax checks
make app-up  # server without watching (blocking)
```

## Modules

- `index.html` — page hosting the game canvas
- `src/` — browser game code: `game.js` (pure physics and
  rounds), `api.js` (Jev request and errors), `ai.js`
  (decision loop, latency), `input.js`, `renderer.js`,
  `viewport.js` (800x400 logical court), `main.js` (state
  machine and loop)
- `server.mjs` — static server and TypeSafe proxy
- `test/` — `node --test` suites
- `.casper.json` — Casper workspace config: `setup` runs
  `make worktree-init` (per-worktree `PORT` in `.env`), `run`
  runs `make app-up` (lists the URLs in the info panel)

## Agents

Use the following agents (from the
[skillbox](https://github.com/alexandreroman/skillbox)
plugin) for all code tasks:

- **code-writer** — for ANY task that writes,
  modifies, or refactors code. This includes
  one-line fixes, import changes, visibility
  tweaks, and adding assertions. Never edit
  source files directly — always delegate to
  this agent.
- **code-reviewer** — for read-only code review
  before merging or when investigating issues.

## Memory

At the start of every conversation, read
`.claude/project-memory/MEMORY.md` to load
project context from previous conversations.

Use the **project-memory** skill (from the
[skillbox](https://github.com/alexandreroman/skillbox)
plugin) proactively — without being asked — whenever
the conversation reveals project decisions, deadlines,
team context, external references, workflow preferences,
or corrective feedback worth persisting across
conversations.

**Important:** Always use the **project-memory**
skill to persist information. Never use the built-in
auto-memory system (`~/.claude/projects/.../memory/`)
for project decisions or context — it is local and
not shared with the team.

## Conventions

- Line length limits for readability:
  - Text / Markdown: 80 columns max
  - Code: 120 columns max
- Follow standard Markdown conventions: blank line
  before and after headings, blank line before and
  after lists, fenced code blocks with a language tag
- Always use the latest LTS or stable version of
  languages, frameworks, and libraries. Check the
  official documentation or use available tools
  (e.g. context7) to verify current versions before
  choosing a dependency.
