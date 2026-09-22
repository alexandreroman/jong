---
name: "API key handling"
description: "The user-entered TypeSafe API key lives in memory only, never in any browser storage"
type: project
---

# API key handling

The player enters their TypeSafe API key in the game. The key lives only in
a JavaScript variable: it is never written to `localStorage`,
`sessionStorage`, cookies, or the proxy. Reloading the page requires
entering it again. The menu offers a "Change API key" action.

**Why:** explicit user requirement.

**How to apply:** reject any change that persists the key anywhere.
