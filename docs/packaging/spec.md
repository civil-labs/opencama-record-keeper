# Spec: package Record Keeper as a container image in CI

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-19 |
| **Status** | Accepted in #10. |
| **Intent** | [`intent.md`](intent.md) |

This spec sets out the image, how it's configured, what CI tests and publishes, and how
releases work. The order of the work goes in [`plan.md`](plan.md).

## Decisions on the intent's open questions

| Question | Decision |
|---|---|
| Server and base image | **nginx, on `nginxinc/nginx-unprivileged:1.30.6-alpine3.24`.** This is the shape of the Roll Reviewer frontend (nginx with an SPA fallback), but on the unprivileged variant, so the image runs as non-root (UID 101) and listens on 8080 without root, matching the civil-os services. The stable line, pinned to an exact version. |
| `config.json` | **A mounted file.** A deployment mounts its own `config.json` (a ConfigMap, in Kubernetes) over `/usr/share/nginx/html/config.json`. There's no entrypoint and no templating: the app already loads and validates `config.json` at startup. The image keeps the build's `config.json`, which points at the local stack, so `docker run` works against `mise run up` with no mount. |
| Security headers | **The image sends the headers that don't depend on the instance.** See [Headers](#headers). Its CSP sets `script-src 'self'; style-src 'self'` and the other fixed directives, but no `connect-src` or `img-src`, so any gateway, IdP and basemap work. A deployment that wants a full policy adds it at its ingress. |
| Releases | **Now, with release-please and promotion, as in civil-os.** A deployment should pin a version from the start. The workflows and the promotion script are copied from civil-os, which already proves them. |

## The image

**Name:** `ghcr.io/civil-labs/opencama-record-keeper`. One image; the repo holds one app.

**`Dockerfile`** at the repo root, in two stages:

1. **Build:** `node:22.23.4-alpine3.24`, the Node version in `mise.toml`.
   - `COPY package.json package-lock.json`, then `npm ci` with a BuildKit cache mount
     for the npm cache.
   - Copy the sources, then `npm run build` (`tsc -b && vite build`).
   - Tests and lint don't run here; CI runs them before it builds the image.
2. **Run:** `nginxinc/nginx-unprivileged:1.30.6-alpine3.24`.
   - `COPY nginx.conf /etc/nginx/conf.d/default.conf`.
   - `COPY --from=build /app/dist /usr/share/nginx/html`.
   - `EXPOSE 8080`. The base image's user (101) and `CMD` are kept.

**`.dockerignore`:** `node_modules`, `dist`, `.git`, `.github`, `docs`, `coverage` and
editor and agent directories. The build context then holds only what the build reads.

### Serving (`nginx.conf`)

| Path | Behavior | `Cache-Control` |
|---|---|---|
| `/assets/*` | The file, or 404 if it's missing. Never the SPA fallback: a stale page asking for an old hashed asset should fail clearly, not get HTML. | `public, max-age=31536000, immutable` (names are content-hashed) |
| `/config.json` | The file. | `no-cache`, so a changed ConfigMap takes effect on the next load |
| `/index.html` | The file. | `no-cache`, so a new release is picked up on the next load |
| Anything else | `index.html` (the SPA fallback), so `/parcels/<id>` and every other route load the app. Status 200. | `no-cache` |

- **MIME types:** serve `.mjs` as `application/javascript`, the type the base image
  already uses for `.js`. MapLibre's worker is emitted as `assets/maplibre-<hash>.mjs`
  and loaded as a module worker, and browsers refuse a module script served as
  `application/octet-stream`. The base image's `mime.types` has no `.mjs` entry
  (checked in `1.30.6-alpine3.24`). Roll Reviewer patches it for the same reason. Here
  it's a `types { application/javascript mjs; }` block in `nginx.conf`, not an edit to
  the base image's file. The block follows `include /etc/nginx/mime.types;`, because a
  `types` block on its own replaces the inherited map.
- **Compression:** `gzip on` for text, CSS, JavaScript (including `.mjs`), JSON and SVG,
  above 1 kB.
- **No proxying.** The browser calls the gateway and the IdP directly.
- **`server_tokens off`**, so the nginx version isn't advertised.

### Headers

Sent on every response:

| Header | Value |
|---|---|
| `Content-Security-Policy` | `script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

- `script-src` and `style-src` are the policy the MVP smoke checklist verified with zero
  violations (`docs/mvp/smoke.md`, section 10). MapLibre's worker is same-origin, so
  `worker-src` falls back to `script-src 'self'` and needs no entry.
- No `connect-src`, `img-src` or `default-src`: those name the instance's gateway, IdP
  and basemap, which the image doesn't know. Leaving them out allows any origin for
  those fetches; a deployment can add them at its ingress.
- `frame-ancestors 'none'` stops the app being framed (clickjacking). `form-action
  'none'` is safe because the app has no forms that submit. Sign-in is a redirect, not
  a form post.
- `npm run preview` keeps its own CSP header (`vite.config.ts`). It's updated to the
  same value, so local previews and the image agree.

### Health checks

Probes use `GET /config.json`: it's a real file, so a 200 means nginx is up and the
deployment's config is mounted. There's no extra health endpoint.

## CI

### On every PR: `ci.yml` gains an `image` job

It runs after the existing checks pass (typecheck, lint, test, build), and doesn't push:

1. Build the image with `docker/build-push-action` (`load: true`, `push: false`), with
   the GitHub Actions cache.
2. Run `scripts/image-test.sh <image>`. It starts the container with a test
   `config.json` mounted, then checks:
   - `/` and `/parcels/a0000000-0000-4000-8000-000000000002` return `index.html` with
     200;
   - `/config.json` returns the mounted file, not the build's;
   - every file in the image's `assets/` returns 200, and `.mjs` files have
     `Content-Type: application/javascript`;
   - `/assets/missing.js` returns 404, not `index.html`;
   - the cache and security headers in the tables above;
   - the container runs as a non-root UID.

The script uses only `docker` and `curl`, so it can be run locally against any tag.

### On a push to `main`: `images.yml`, job `build`

The civil-os `build` job, with one image instead of a matrix:

- Log in to GHCR with `GITHUB_TOKEN` (`packages: write`).
- `docker/metadata-action` with `flavor: latest=false` and `type=sha,prefix=sha-`, and
  `DOCKER_METADATA_SHORT_SHA_LENGTH: "7"`. **Never `:latest`.**
- Build and push for `linux/amd64`, with the GHA cache.
- Attest build provenance (`actions/attest-build-provenance`, pushed to the registry).
- Run `scripts/image-test.sh` against the pushed `:sha-<short>` as well, so the
  published image is the one that was tested.

Every action is pinned by commit SHA, using the same versions as civil-os.

### On a release tag `v*`: `images.yml`, job `promote`

Copied from civil-os (`docs/image-promotion/spec.md`), unchanged in behavior:

- Wait (every 15 s, up to 20 minutes) for `:sha-<short>` of the tagged commit.
- Add `:vX.Y.Z` with `docker buildx imagetools create`, then check both tags resolve to
  the same digest.
- Refuse to move an existing `:vX.Y.Z` that points elsewhere.
- Never build on a tag.

`scripts/promote-image.sh` and its test are copied from civil-os as they are. A comment
in each names the source path, so a later fix can be carried over.

### Releases: `release-please.yml`

- release-please, with the `node` release type, opens release PRs from the conventional
  commits on `main`, bumps `package.json`'s `version`, and tags `vX.Y.Z`.
- Pre-1.0, as in civil-os: `bump-minor-pre-major` and `bump-patch-for-minor-pre-major`.
  The first release is `v0.1.0`.
- It authenticates as the same GitHub App as civil-os, through repo secrets
  `RELEASE_PLEASE_APP_ID` and `RELEASE_PLEASE_PRIVATE_KEY`. A tag pushed with
  `GITHUB_TOKEN` wouldn't trigger `images.yml`.
- **PRs are squash-merged** (owner's decision, 2026-11-19), with the PR title as the
  commit message, as in civil-os. release-please reads one conventional commit per PR,
  so the changelog has one line per PR.
  - A new `pr-title.yml` workflow, copied from civil-os, checks that every PR title is a
    conventional commit (`amannn/action-semantic-pull-request`, pinned by SHA). Its job
    is `conventional-title`.
  - Commits inside a branch still follow the conventional format, since the plan's
    steps are reviewed commit by commit. Only the title reaches `main`.

## GitHub setup (owner, once)

A checklist in `docs/github-setup.md`, modeled on civil-os's:

- [x] Merge settings: squash merging only, with the default commit message set to
      "Pull request title"; merge commits and rebase merging off. (Done 2026-11-19.)
- [ ] A ruleset for `main` requiring the CI checks and `conventional-title`. The check
      names are listed once they've run.
- [ ] Install the release-please GitHub App on this repo, and add its two secrets
      (`RELEASE_PLEASE_APP_ID`, `RELEASE_PLEASE_PRIVATE_KEY`). The owner is doing this.
- [ ] After the first `main` push, set the `opencama-record-keeper` package's visibility
      to public and link it to this repo.
- [ ] Confirm Actions may create pull requests (needed by release-please).

## Documentation

- **README, "Running the image":**
  `docker run -p 3000:8080 ghcr.io/civil-labs/opencama-record-keeper:<tag>` runs
  against the local stack. Host port 3000 is the origin the local Dex client and the
  gateway allow. To point at another instance, mount a file:
  `-v ./config.json:/usr/share/nginx/html/config.json:ro`.
  It lists the `config.json` fields, and says the client ID must be listed in that
  gateway's `CIVIL_OS_GATEWAY_ALLOWED_CLIENT_IDS` with the app's origin as a redirect
  URI.
- **`docs/mvp/smoke.md`** gains a setup variant: run the checklist against the image
  instead of `npm run dev`.

## Testing

- **Every PR:** `scripts/image-test.sh` (above).
- **`main`:** the same script on the pushed image, plus attestation (checked once by
  hand with `gh attestation verify oci://ghcr.io/civil-labs/opencama-record-keeper:sha-<short> --repo civil-labs/opencama-record-keeper`).
- **Manual, before accepting the feature:** run the published image on port 3000
  against a fresh civil-os `mise run up`, and pass the MVP smoke checklist, section 10
  included. A person sees CSP violations in the browser console. A scripted run needs a
  `report-uri` collector and a control page that's known to violate the policy, because
  Firefox doesn't pass CSP warnings to automation; section 10 gains a note saying so.
- **The first release:** check `:vX.Y.Z` and `:sha-<short>` have the same digest, and
  the attestation verifies for the version tag.

## Out of scope

As in the intent: the Helm chart and deployment, a CDN, a proxy, ARM images and
code-splitting.
