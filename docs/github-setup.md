# GitHub setup

These are the one-time settings the repository needs, outside the code, for CI, image
publishing and releases to work. Only a repository or organization admin can make
them. The layout follows civil-os's `docs/github-setup.md`.

## 1. Merge settings and branch rules

In **Settings → General → Pull Requests**:

- [x] Allow **squash merging** only, with the default commit message set to **"Pull
  request title"**. release-please reads the squashed title as a conventional commit.
  (Done 2026-11-19.)
- [x] Turn off merge commits and rebase merging. (Done 2026-11-19.)

In **Settings → Rules → Rulesets**, a ruleset for `main`:

- [x] Require these status checks to pass (added 2026-11-19):
  - `check`: typecheck, lint, unit tests, build, and the promotion script's test;
  - `image`: builds the image and runs `scripts/image-test.sh` against it.
- [ ] Add **`conventional-title`** once this checklist's PR has merged. It runs from
  `main`'s copy of `pr-title.yml` (`pull_request_target`), so it can't report on the PR
  that adds it.

## 2. release-please App and its credentials

Tags created with the default `GITHUB_TOKEN` don't trigger other workflows. A GitHub
App token makes the release tag start `images.yml`.

- [x] The `civil-labs` release-please GitHub App, the one civil-os uses, is installed on
  this repository.
- [x] Its credentials are set at the organization level, available to this repository:

  | Name | Kind | Used by |
  |---|---|---|
  | `RELEASE_PLEASE_APP_ID` | Organization **variable** (`vars.`) | `release-please.yml` |
  | `RELEASE_PLEASE_PRIVATE_KEY` | Organization **secret** (`secrets.`) | `release-please.yml` |

  To check that this repository receives them:
  `gh api repos/civil-labs/opencama-record-keeper/actions/organization-variables --jq '.variables[].name'`
  and the same with `organization-secrets` and `.secrets[].name`.

"Allow GitHub Actions to create and approve pull requests" can stay off: release-please
opens its PRs as the App, not as `GITHUB_TOKEN`.

## 3. GitHub Container Registry

The first `main` run of `images.yml` created
`ghcr.io/civil-labs/opencama-record-keeper`.

- [x] Visibility set to **public**, so deployments pull it anonymously. (Done
  2026-11-19.)
- [x] Linked to this repository, through the image's `org.opencontainers.image.source`
  label, which `docker/metadata-action` sets.
- [ ] Under **Manage Actions access**, check this repository has **Write** access. The
  first push gave it, but check it after any change to the package's settings.

## 4. After the first release

- [ ] The first release PR proposes `v0.1.0`, with a changelog of the packaging PRs.
- [ ] Merging it tags `v0.1.0`. The tag's `promote` job adds `:v0.1.0` to the `main`
  image for that commit. Check both tags have the same digest, and that
  `gh attestation verify oci://ghcr.io/civil-labs/opencama-record-keeper:v0.1.0 --repo civil-labs/opencama-record-keeper`
  passes.

## 5. Release image missing

A `v*` tag doesn't build an image: the Images run's `promote` job adds the tag to the
`:sha-<short>` image that the `main` run built for the same commit. It fails when that
image never appears (usually because the `main` Images run failed), or when `:vX.Y.Z`
already points at a different image, since it never moves a published tag.

To recover:

1. Re-run the failed `main` Images run for the tagged commit, and wait for it.
2. On the tag's Images run, choose **Re-run failed jobs**.

As a last resort, promote by hand, then check both tags have the same digest:

```sh
docker buildx imagetools create \
  --tag ghcr.io/civil-labs/opencama-record-keeper:vX.Y.Z \
  ghcr.io/civil-labs/opencama-record-keeper:sha-<short>
docker buildx imagetools inspect ghcr.io/civil-labs/opencama-record-keeper:vX.Y.Z --format '{{.Manifest.Digest}}'
docker buildx imagetools inspect ghcr.io/civil-labs/opencama-record-keeper:sha-<short> --format '{{.Manifest.Digest}}'
```
