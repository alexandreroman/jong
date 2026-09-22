---
name: "Makefile as the tooling entry point"
description: "Tool integrations go through generic Makefile targets, not shell scripts or tool-prefixed names"
type: feedback
---

# Makefile as the tooling entry point

Developer tooling and integrations (e.g. Casper) are Makefile targets, never
standalone shell scripts. Target names are generic and tool-agnostic:
`worktree-init` prepares a fresh worktree; `dev` (watch mode) and `app-up`
(foreground, blocking) both run the app and publish its endpoints to the
Casper info panel when running inside Casper. There is no separate publish
or clear target.

**Why:** explicit user preference; one self-documenting entry point, and
names that describe the action rather than the tool behind it.

**How to apply:** add new integration steps to an existing generic target
or a new generic target in the Makefile; never add a `scripts/*.sh` or a
`<tool>-*` target name.
