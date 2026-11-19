# Record Keeper

Record Keeper is the OpenCAMA app for viewing, and later editing, the records in a
[Civil OS](https://github.com/civil-labs/civil-os) instance. The MVP is read-only:
pick a parcel on a map, see its details, and follow every reference it holds to
another record.

It's a static single-page app (Vite, React, TypeScript, StyleX) that talks only to
the Civil OS public API, through the
[`@civil-labs/civil-os-api`](https://www.npmjs.com/package/@civil-labs/civil-os-api)
SDK. There's no backend.

## Develop

You need [mise](https://mise.jdx.dev) and a running Civil OS local stack.

```sh
# In a civil-os checkout: start the stack on synthetic data (needs Docker).
mise run up

# Here:
mise install      # Node, as pinned in mise.toml
npm ci
npm run dev       # http://localhost:3000
```

The dev server must run on port 3000, the redirect URI registered for the local
stack's `record-keeper-dev` client (a public client, added in civil-os #60).

| Script | What |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` | Type-check, then build static files into `dist/` |
| `npm run typecheck` | `tsc -b` |
| `npm run lint` | ESLint, including the StyleX and styling rules |
| `npm test` | Vitest |

## Running the image

Every push to `main` publishes `ghcr.io/civil-labs/opencama-record-keeper:sha-<short>`,
and each release adds `:vX.Y.Z` to the same image. There's no `:latest`, so pin a
version. The image is nginx, running as a non-root user and listening on 8080.

Against the local stack (`mise run up` in civil-os):

```sh
docker run --rm -p 3000:8080 ghcr.io/civil-labs/opencama-record-keeper:<tag>
```

Use host port 3000, since that's the origin the local `record-keeper-dev` client
allows. The image's built-in `config.json` points at the local stack.

For any other instance, mount your own `config.json` over the built-in one:

```sh
docker run --rm -p 3000:8080 \
  -v ./config.json:/usr/share/nginx/html/config.json:ro \
  ghcr.io/civil-labs/opencama-record-keeper:<tag>
```

On an SELinux host, use `:ro,z`. In Kubernetes, mount a ConfigMap at the same path.
The app reads it on every page load (it's served `no-cache`), so a change applies on
the next load.

| Field | What |
|---|---|
| `gatewayUrl` | The Civil OS gateway's base URL, with no trailing slash. The app asks it for the instance's OIDC issuer. |
| `clientId` | The OIDC client ID the app signs in with. |
| `basemapStyleUrl` | A MapLibre style JSON URL for the basemap. |

The instance has to accept the app:

- The gateway lists `clientId` in `CIVIL_OS_GATEWAY_ALLOWED_CLIENT_IDS`.
- The IdP has `clientId` as a public client (PKCE, no secret), with
  `<app origin>/callback` as a redirect URI, and allows the app's origin for CORS.

The image sends a Content Security Policy that names no origins
(`script-src 'self'; style-src 'self'` and other fixed directives). To restrict
`connect-src` and `img-src` to the instance's gateway, IdP and basemap, add a full
policy at your ingress. Probe `GET /config.json` for health: a 200 means nginx is up
and the config is there.

To check an image locally, run `sh scripts/image-test.sh <image>`. CI runs it on every
PR.

## Styling

Every style is [StyleX](https://stylexjs.com), declared next to the component that
uses it. There are no `style` or `className` props, and lint enforces that. The
only stylesheets are MapLibre's and `src/stylex.css`, which is empty on purpose: its
comment explains why it exists.

## Design docs

- [`docs/mvp/intent.md`](docs/mvp/intent.md): what the MVP is for.
- [`docs/mvp/spec.md`](docs/mvp/spec.md): how it works.
- [`docs/mvp/plan.md`](docs/mvp/plan.md): the order it's built in.
- [`docs/packaging/`](docs/packaging/): the container image, CI publishing and
  releases (intent, spec and plan).
- [`docs/github-setup.md`](docs/github-setup.md): the repository settings CI and
  releases need.
