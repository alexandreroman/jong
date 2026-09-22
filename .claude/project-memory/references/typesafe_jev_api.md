---
name: "TypeSafe Jev API"
description: "Jev endpoint, request/response shape, and CORS behaviour (browser origins rejected)"
type: reference
---

# TypeSafe Jev API

Jev is TypeSafe AI's "System One" model, called via
`POST https://api.typesafe.ai/v1/systemone` with
`Authorization: Bearer <key>` and model `jev-latest`. The body has a
`state` (string or JSON) and named `questions`, e.g.
`{"type": "choice", "instructions": "...", "criteria": {"a": "...", ...}}`.
The response contains `answers.<name>.choice`, `.probabilities` and
`.confidence`. Latency is 70-500 ms; limits are 1,200 requests/min.

The API rejects CORS preflights from every origin tested on 2026-09-22
(localhost, 127.0.0.1, `null`, github.io, typesafe.ai subdomains) with
`400 Disallowed CORS origin`. OpenRouter serves Jev
(`~typesafe/jev-latest`) with `access-control-allow-origin: *`, as an
alternative that needs an OpenRouter key.

**Why:** explains why the local proxy exists and where the API contract is
documented.

**How to access:** docs at https://docs.typesafe.ai/models and
https://docs.litellm.ai/docs/pass_through/typesafe (raw HTTP example).
