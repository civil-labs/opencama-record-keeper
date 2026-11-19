# Intent: package Record Keeper as a container image in CI

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-19 |
| **Status** | Draft. Accepted when merged. |
| **Repo** | `opencama-record-keeper` |

## Problem

The read-only MVP is done, but it only runs as `npm run dev` on a developer's machine.
Nothing produces an artifact a Civil OS deployment can run:

- there's no image, so the Helm chart has nothing to point at;
- `dist/` needs a server with an SPA fallback, the right caching, and the right MIME
  type for MapLibre's `.mjs` worker, and none of that is written down or tested;
- each deployment needs its own `config.json` (gateway URL, client ID, basemap), and
  there's no defined way to supply it;
- there are no versions, so a deployment can't pin a release or roll back to one.

## Proposed outcome

CI builds Record Keeper into one small, non-root container image that serves the
production build, and publishes it the way civil-os publishes its services.

- **One image, any instance.** The image holds the build and a static file server. A
  deployment supplies `config.json` at run time. Nothing instance-specific is baked in.
- **Tested before it's published.** Every PR builds the image and checks how it serves
  pages, assets and config, so a broken image can't reach `main`.
- **Published like civil-os.** Every `main` commit pushes `:sha-<short>` to GHCR, with
  provenance attested. Releases get `:vX.Y.Z` by promoting the image that was already
  built and tested, not by rebuilding it. There's never a `:latest`.
- **Documented.** The README says how to run the image and what it expects.

## Success criteria

- A PR that breaks the image (the build, the SPA fallback, the `.mjs` MIME type, or the
  config mount) fails CI.
- After a merge to `main`, `ghcr.io/civil-labs/opencama-record-keeper:sha-<short>`
  exists, and its provenance verifies with `gh attestation verify`.
- Running that image with a mounted `config.json`, against the civil-os local stack,
  passes the MVP smoke checklist (`docs/mvp/smoke.md`), including section 10 (no CSP
  violations).
- A release tag `vX.Y.Z` points at the same digest as the `main` image for that commit.

## Non-goals

- The Helm chart and any deployment. Those live in the charts and gitops repos, which
  aren't changed from here.
- A CDN, or serving from object storage.
- A backend or API proxy. The browser calls the gateway directly, as it does now.
- ARM images. The build is `linux/amd64` only, as in civil-os, and the promotion step
  doesn't preclude adding platforms later.
- Code-splitting the bundle. That's a separate change to the app.

## Constraints

- No customer or jurisdiction data, ever: no real hostnames, gateway URLs or client IDs
  in the image, workflows, docs or tests. The image's default `config.json` is the
  local-stack one.
- Follow civil-os's image conventions (`docs/image-promotion/spec.md`): actions pinned
  by commit SHA, `sha-<7>` tags, no `:latest`, attested provenance, release tags
  promoted from `main`.
- Keep it small: no entrypoint script or template step, if a mounted file will do.

## Open questions (for the spec)

- Which static server and base image, and how it runs as non-root?
- How `config.json` gets in: a mounted file, or environment variables rendered at
  start?
- Which security headers the image sends itself, given that `connect-src` depends on
  each instance's gateway and IdP.
- Should releases start now, with release-please, or wait for the first deployment?
