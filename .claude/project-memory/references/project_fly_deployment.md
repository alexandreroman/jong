---
name: "Fly.io deployment"
description: "Jong runs on Fly.io as one auto-stopping machine in lax, close to the TypeSafe API origin"
type: project
---

# Fly.io deployment

Jong is deployed on Fly.io as the app `jong` (<https://jong.fly.dev>): a
single `shared-cpu-1x` 256 MB machine in the `lax` region that stops when
idle, with a shared IPv4 only. Each deploy pins the image published by CI
to `ghcr.io/alexandreroman/jong` by its digest (`@sha256:…`), never by the
mutable `latest` tag.

**Why:** the TypeSafe API origin sits behind Cloudflare in California.
Warm request latency to it, measured from Fly regions on 2026-09-23: sjc
50 ms, lax 54 ms, dfw 76 ms, iad 92 ms, ord 116 ms, ams 173 ms. One
auto-stopping machine keeps the cost around $2.47/month at most. A digest
makes each deploy reproducible: it always designates the same image.

**How to apply:** keep the region on the US West Coast (`lax` or `sjc`);
resolve the digest of the tag to deploy (`latest`, or the
`sha-<full commit sha>` tag CI also publishes) with `kbld` or a similar
tool (`crane`, `skopeo`, or a `HEAD` request on the registry manifest), then
deploy with `fly deploy --ha=false --image
ghcr.io/alexandreroman/jong@sha256:<digest>`; `--ha=false` stops Fly from
adding a second machine; skip dedicated IPv4 allocation ($2/month).
