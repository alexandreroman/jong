---
name: "Environment file"
description: "Local configuration lives only in a git-ignored .env file; .env.local is not used"
type: project
---

# Environment file

Local configuration (e.g. `PORT`) lives in a single `.env` file at the repo
root. It is git-ignored and loaded by the Makefile for every target. The
project uses no `.env.local` or other env variants. In a Casper workspace,
the `setup` hook (`make worktree-init`) writes `PORT=$CASPER_PORT` into
`.env` so parallel workspaces never collide.

**Why:** explicit user preference for a single env file.

**How to apply:** read and write local settings in `.env` only; never add
`.env.local` handling to scripts, the Makefile, or docs.
