# Plan: package Record Keeper as a container image in CI

| | |
|---|---|
| **Implements** | [`spec.md`](spec.md) (accepted in #10), which implements [`intent.md`](intent.md) (#10) |
| **Author** | Claude (drafted for Jackson, owner / approving engineer) |
| **Date** | 2026-11-19 |
| **Status** | Draft. Accepted when merged. |

## Ground rules

- **Branches and PRs.** The work lands in four PRs (below), each on its own
  short-lived branch off `main`. The agent never pushes to `main`. The owner merges
  each PR.
- **PR titles are conventional commits**, since the repo is squash-merge only and the
  title becomes the commit on `main`. Commits inside a branch are conventional too, one
  per step, because the steps are reviewed commit by commit.
- **Plan and code stay in sync.** If implementation departs from this plan, `plan.md`
  is updated in the same commit, under that PR's "As built". If the departure changes
  the spec, the agent stops and asks the owner first.
- **Verification before "done".** Each PR's checks are run locally, and their output
  goes in the PR description. `npm run typecheck`, `npm run lint`, `npm test` and
  `npm run build` keep passing on every commit.
- **Nothing is pushed to `ghcr.io` before merge.** Local runs build and test the image
  in the local Docker daemon only. Only the `main` workflow publishes.
- **Copied files stay copies.** Files taken from civil-os are copied as they are, at
  civil-os `fe88158`, with a comment naming the source path. Only names (image,
  repo, job names) change.
- **Synthetic values only.** The image test's `config.json`, the docs and the
  workflows name no real gateway, IdP or client ID.

## Environment

- Docker Engine 29.5 and Buildx are available locally (checked 2026-11-19), so the
  image is built and tested here before each push.
- The local Civil OS stack (`mise run up` in civil-os) is needed only for the final
  smoke run. Its gateway listens on host port 8080, so the image test maps the
  container's 8080 to a random host port, never to 8080.
- The host runs SELinux. The image test mounts its `config.json` with `:ro,z`, as
  civil-os does for compose bind mounts. The mount is a file the script creates in its
  own temporary directory, never a path in the repo. Ubuntu runners ignore `z`.

## Decisions the spec leaves to the plan

| Question | Decision |
|---|---|
| Does the PR `image` job also run on pushes to `main`? | **No.** `images.yml` builds and tests the published image on `main`, so the `ci.yml` job runs on pull requests only (`if: github.event_name == 'pull_request'`). It `needs: check`. |
| Where the image test's `config.json` comes from | `scripts/image-test.sh` writes it to a temporary directory, with synthetic values (`https://gateway.example.test`, `image-test`, `https://basemap.example.test/style.json`). Then a `/config.json` that returns the build's `localhost` values fails the test. |
| How the first release becomes `v0.1.0` | `package.json` is `0.0.0` and release-please's pre-major rules would bump that to `0.0.1`. `release-please-config.json` sets `"initial-version": "0.1.0"` and the manifest starts empty, as civil-os did for the public API. |
| Where release-please starts reading history | `"bootstrap-sha": "de0efb4"`, the merge of #10. The MVP's history before it uses merge commits, which aren't conventional. So the first changelog lists the packaging PRs, and the README describes the app. |
| What makes a release PR appear | release-please only opens one for a `feat` or `fix`. PR 1 is titled `feat:`, since a runnable image is new for anyone deploying the app. The other three are `ci:` and `docs:`. |
| The order of the release-please PR and the App secrets | The owner installs the App and adds the two secrets **before** merging PR 3. Otherwise the first `release-please` run on `main` fails. |

## PR overview

| PR | Branch | Title | Depends on |
|---|---|---|---|
| 1 | `feat/image` | `feat: serve the app from a container image` | — |
| 2 | `ci/publish-images` | `ci: publish images from main and promote release tags` | PR 1 |
| 3 | `ci/releases` | `ci: release-please and the PR title check` | PR 2, and the owner's App setup |
| 4 | `docs/image` | `docs: running the image` | PR 3, and the first image on GHCR |

PR 1 is useful on its own: once it's merged, `docker build .` produces a working image.

## PR 1: the image (`feat/image`)

1. **`build: Dockerfile, nginx config and dockerignore`**
   - `Dockerfile`: the two stages in the spec's [The image](spec.md#the-image).
     `node:22.23.4-alpine3.24`, then `nginxinc/nginx-unprivileged:1.30.6-alpine3.24`.
     `npm ci` uses a BuildKit cache mount (`--mount=type=cache,target=/root/.npm`).
   - `nginx.conf`: the four locations in [Serving](spec.md#serving-nginxconf), the
     `types` block for `.mjs`, gzip, `server_tokens off`, and the headers in
     [Headers](spec.md#headers). The headers use `add_header … always`, and they're
     repeated in every location that sets its own `Cache-Control`, because nginx
     doesn't inherit `add_header` into a block that has its own.
   - `.dockerignore`: the spec's list, plus `.claude`, `.vscode` and `.idea`.
2. **`build: match the preview CSP to the image's`**: `vite.config.ts` sends the
   image's full CSP from `npm run preview`. The comment then says the image sends it
   too.
3. **`test: image-test.sh checks how the image serves`**: `scripts/image-test.sh
   <image>`, using only `docker` and `curl`:
   - It runs the container detached, with a random host port and the test config
     mounted, and removes it on exit (`trap`).
   - It waits up to 30 s for `/config.json` to answer.
   - It makes each check in the spec's [CI](spec.md#on-every-pr-ciyml-gains-an-image-job)
     section. The asset list comes from `docker exec … find /usr/share/nginx/html/assets
     -type f`. The UID check is `docker exec … id -u`, which must not be `0`.
   - It prints one line per check, and exits 1 if any failed, after running them all.
4. **`ci: build and test the image on pull requests`**: the `image` job in `ci.yml`.
   It uses `docker/setup-buildx-action` and `docker/build-push-action` at civil-os's
   pinned SHAs, with `load: true`, `push: false`, `tags: record-keeper:ci` and the GHA
   cache (`scope=image`), then runs `sh scripts/image-test.sh record-keeper:ci`.

**Local checks, results in the PR description:**

- `docker build -t record-keeper:local .` succeeds, and the image's size is noted.
- `sh scripts/image-test.sh record-keeper:local` passes.
- It fails as it should, once each, on a throwaway local edit (not committed): with the
  `.mjs` type removed, with the SPA fallback removed, and with the config mount left out.
- `docker run -p 3000:8080 record-keeper:local` against `mise run up`: sign in, select
  a parcel, open a transfer. The console shows no CSP violations.

## PR 2: publish from `main` (`ci/publish-images`)

1. **`ci: copy the image promotion script from civil-os`**: `scripts/promote-image.sh`
   and `scripts/promote-image_test.sh`, unchanged except for a header line naming
   `civil-os/scripts/…` and the comment examples, which name this repo's image. The
   `check` job in `ci.yml` runs the test first, as civil-os's does.
2. **`ci: build, test and attest the image on main`**: `images.yml`, job `build`, as in
   the spec. It's civil-os's `build` job without the matrix, with
   `IMAGE: ghcr.io/civil-labs/opencama-record-keeper`, `file: Dockerfile`, the same
   cache scope as PR 1's job, and a last step running
   `sh scripts/image-test.sh "$IMAGE:sha-${GITHUB_SHA::7}"`.
3. **`ci: promote release tags to the main image`**: job `promote`, civil-os's without
   the matrix.

**Local checks:** `sh scripts/promote-image_test.sh` passes, and `actionlint` reports
nothing on the workflows (run from its released binary, not installed).

**After merge** (by the agent, reported to the owner):

- The `main` run pushes `:sha-<short>`, and its test step passes.
- `gh attestation verify oci://ghcr.io/civil-labs/opencama-record-keeper:sha-<short> --repo civil-labs/opencama-record-keeper`
  passes.
- The owner sets the package public and links it to the repo (the setup checklist in
  PR 3 records this).

## PR 3: releases (`ci/releases`)

1. **`ci: check PR titles are conventional commits`**: `pr-title.yml`, copied from
   civil-os. It only takes effect once on `main`, since `pull_request_target` runs the
   base branch's workflow.
2. **`ci: release-please`**: `release-please.yml`, copied from civil-os, and:
   - `release-please-config.json`: one package `"."`, `release-type: node`,
     `include-component-in-tag: false`, the two pre-major flags, `initial-version`
     and `bootstrap-sha` from the decisions above;
   - `.release-please-manifest.json`: `{}`.
3. **`docs: GitHub setup checklist`**: `docs/github-setup.md`, the spec's checklist,
   laid out like civil-os's sections 1 to 4 and 7: merge settings and the ruleset,
   secrets, the App (installed on this repo too), the GHCR package, and recovering a
   missing release image. The required check names are `check`, `image` and
   `conventional-title`.

**Before merge:** the owner confirms the App is installed and the two secrets exist.

**After merge:** the `release-please` run on `main` passes, and it opens a release PR
proposing `v0.1.0`. It isn't merged until PR 4 is in.

## PR 4: docs (`docs/image`)

1. **`docs: running the image`**: the README section in the spec's
   [Documentation](spec.md#documentation), with the `config.json` fields and the
   gateway requirements.
2. **`docs: smoke checklist against the image`**: `docs/mvp/smoke.md`'s Setup gains
   the image variant (`docker run -p 3000:8080 …:sha-<short>` in place of
   `npm run dev`), and section 10 gains the note on scripted CSP checks from the
   spec's [Testing](spec.md#testing).

The agent runs the smoke checklist against the published `:sha-<short>` image and a
fresh `mise run down && mise run up`, and puts the results in the PR description.

## Final verification (before reporting the feature done)

- Every success criterion in the intent, each with its evidence:
  - PR 1's deliberately broken builds failed the image test (the failing output is in
    PR 1).
  - The `main` image exists and its attestation verifies (PR 2).
  - The smoke checklist passes against that image, section 10 included (PR 4).
- The owner merges the `v0.1.0` release PR. The tag's `promote` job passes,
  `:v0.1.0` and `:sha-<short>` resolve to the same digest, and
  `gh attestation verify` passes for `:v0.1.0`.

## Risks

| Risk | Mitigation |
|---|---|
| A header is lost in a location block that sets its own `add_header` | The image test checks every header on `/`, `/index.html`, `/config.json`, an asset and a fallback route. |
| release-please's `node` type with an empty manifest doesn't pick up `initial-version` | Found when PR 3 merges. Fix in a follow-up `ci:` PR with a `Release-As: 0.1.0` footer. That's a plan change, not a spec change. |
| `bootstrap-sha` on a squash-merge commit misses PR 1 | `de0efb4` is #10's merge, before PR 1, so every packaging PR is after it. Checked in the first release PR's changelog. |
| GHA cache scopes collide between the PR and `main` jobs | They share scope `image` on purpose: a PR then reuses `main`'s layers. Both jobs build the same Dockerfile, so a hit is always valid. |
| The base image tags move | Both are exact versions. Upgrades are their own `build:` PRs, as with npm dependencies. |

## Out of scope for this plan (per spec)

The Helm chart and deployment, a CDN, a proxy, ARM images and code-splitting.
