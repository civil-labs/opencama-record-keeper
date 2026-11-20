# Intent: update nginx for CVE-2026-123633 and CVE-2026-123007

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-20 |
| **Status** | Draft. Accepted when merged. |
| **Repo** | `opencama-record-keeper` |

## Problem

The Record Keeper image serves the app with nginx 1.30.6
(`nginxinc/nginx-unprivileged:1.30.6-alpine3.24`). Two CVEs published on
2026-11-18 affect that version. Both are in `ngx_http_v2_module`, and both are
rated CVSS 3.1 8.1 (High) and CVSS 4.0 9.2 (Critical):

| CVE | Flaw | Precondition (per the record) |
|---|---|---|
| [CVE-2026-123633](https://www.cve.org/CVERecord?id=CVE-2026-123633) | Use-after-free in a worker | HTTP/2 for client connections, proxying to a backend, and a worker low on `worker_connections` |
| [CVE-2026-123007](https://www.cve.org/CVERecord?id=CVE-2026-123007) | Integer underflow in HTTP/2 flow control, leading to a heap buffer overflow | HTTP/2 in use |

The impact is a crashed worker, and code execution where ASLR is disabled or
can be bypassed. Neither record lists a workaround. For nginx Open Source,
both records give the affected ranges as 1.30.0 up to 1.30.7, and 1.31.0 up
to 1.31.9.

**As configured, the image is probably not exploitable.** `nginx.conf`
listens with plain `listen 8080;`, enables no HTTP/2 and proxies to nothing.
But the vulnerable code still ships:
- image scanners flag both CVEs against every published Record Keeper image,
  including the `v0.1.0` release;
- a deployment that edits the config to enable HTTP/2 would be exposed.

**The fixed version isn't published for the current base image yet.** The
official `nginx:1.30.7-alpine3.24` image exists. `nginxinc/nginx-unprivileged`,
which the image uses so that it runs as non-root, has published only up to
1.30.6 and 1.31.7 (checked 2026-11-20). Neither of those is fixed.

## Proposed outcome

- **The image runs a fixed nginx:** 1.30.7 or later on the 1.30 stable line,
  still as a non-root user, with the same serving behaviour.
- **A patch release** (`v0.1.1`), so deployments pinned to a release tag can
  move off the affected image.
- **Exposure stays narrow:** HTTP/2 stays off in the image's own config, so a
  future nginx HTTP/2 bug doesn't reach Record Keeper by default.

## Success criteria

- `nginx -v` in the image published from `main` reports 1.30.7 or later.
- The image still runs as UID 101, with no root step at start.
- `scripts/image-test.sh` passes against the new image, so the SPA fallback,
  caching, `.mjs` MIME type, config mount and headers are unchanged.
- A container image scan of the new image reports neither CVE.
- `v0.1.1` is released, and its tag points at the same digest as the `main`
  image for that commit (as `docs/packaging/spec.md` requires).
- The MVP smoke checklist (`docs/mvp/smoke.md`) passes against the new image.

## Non-goals

- The ingress, load balancer or any nginx in a deployment, such as
  ingress-nginx in front of Civil OS. Those live in the charts and gitops
  repos, which aren't changed from here. A deployment that terminates HTTP/2
  with an affected nginx needs its own fix.
- Moving to the 1.31 mainline, unless it's the only fixed non-root image
  available.
- Changing what the image serves, its headers or its caching.

## Constraints

- Follow `docs/packaging/spec.md`: non-root, no entrypoint script or template
  step, no `:latest`, release tags promoted from `main` and not rebuilt.
- Pin the base image by a full version tag, as now, and record its digest in
  the spec if the image changes source.
- No customer or jurisdiction data in the image, docs or tests.

## Open questions (for the spec)

- **The base image:** wait for `nginxinc/nginx-unprivileged:1.30.7-alpine3.24`,
  or switch to the official `nginx:1.30.7-alpine3.24` and make it run as
  non-root ourselves? The second option means:
  - a `USER` line and file ownership;
  - a listen port above 1024;
  - moving the pid and temp paths.

  How long can we wait before the release matters to a deployment?
- **Keeping it fixed:** should CI scan the image for known CVEs, and fail or
  only warn? Scanning would have caught this without a manual report.
- **Asserting HTTP/2 stays off:** should `scripts/image-test.sh` check that the
  image refuses HTTP/2 (for example, with `curl --http2-prior-knowledge`)?
