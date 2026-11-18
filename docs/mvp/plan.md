# Plan: Record Keeper MVP

| | |
|---|---|
| **Implements** | [`spec.md`](spec.md) (accepted in #1, corrected in this PR), which implements [`intent.md`](intent.md) (#1) |
| **Author** | Claude (drafted for Jackson, owner / approving engineer) |
| **Date** | 2026-11-17 |
| **Status** | Draft. Accepted when merged. |

## Ground rules

- **Branches and PRs.** The work lands in seven PRs (below), each on its own
  short-lived branch off `main`. The agent never pushes to `main`. The owner merges
  each PR.
- **Each step is one commit** with a conventional-commit message. From PR 1 on, every
  commit passes `npm run typecheck`, `npm run lint`, `npm test` and `npm run build`.
- **Plan and code stay in sync.** If implementation departs from this plan, `plan.md`
  is updated in the same commit. If the departure changes the spec, the agent stops
  and asks the owner first.
- **Verification before "done".** Each PR's checks are run locally, and their output
  goes in the PR description. PRs that touch behaviour against Civil OS also list
  which manual checks were run against the local stack, and their results.
- **Exact versions.** Every dependency is pinned to an exact version in `package.json`,
  and `package-lock.json` is committed. Upgrades are their own `build:` commits.
- **Synthetic data only.** Development, tests, screenshots and docs use the civil-os
  local stack and its synthetic fixtures. No production hostnames or data, since the
  repo is public.
- **Styling rules are enforced from the first commit** (see the spec's
  [Styling](spec.md#styling)). Lint rejects `.css` imports other than MapLibre's, and
  `style`/`className` props.

## Environment

- **Node** comes from `mise.toml` (`node = "22.23.4"`, matching civil-os).
- **The local Civil OS stack** (`mise run up` in civil-os) is needed from PR 2 on, for
  sign-in and every RPC. It runs on Docker. Checked 2026-11-17: Docker Engine 29.5 and
  Compose v5.1 are running, and the user can reach the daemon through the `docker`
  group.
- **Local URLs:** the gateway is at `http://localhost:8080` and Dex at
  `http://localhost:5556/dex`. The Dex client is `record-keeper-dev`, a public client
  with redirect `http://localhost:3000/callback`, added in civil-os #60. (The plan
  first named `civil-os-dev`, which is confidential, and the local Dex didn't allow
  CORS, so a browser sign-in couldn't finish.) The test user is `dev@example.com`.

## The SDK release

Everything the spec uses is in **public-api v0.3.0**, released 2026-11-18 (civil-os
#47) and published to npm as `@civil-labs/civil-os-api@0.3.0`. It adds:

- the address and party reads;
- `GetParcelExtentsWGS84ByParcelId` and `GetTransfersByPartyId`;
- the neighborhood definitions fix (`NeighborhoodDefinition` with `is_legal`, and
  `GetNeighborhoods` filtered by definition).

**public-api v0.4.0** (civil-os #53, released 2026-11-18) is a breaking change on top of
that. It renames `GetNeighborhoodDefinitionsResponse`'s map from `neighborhoods` to
`neighborhood_definitions`, which is `neighborhoodDefinitions` in the SDK and in Connect
JSON. Nothing else in the public API changed.

PR 2 is the first to install the SDK, and it pins `0.4.0`.

Checked against the published 0.3.0 tarball, and again against 0.4.0 (2026-11-18):

- `AddressesService`, `PartiesService`, `ParcelsService.method.getParcelExtentsWGS84ByParcelId`,
  `RealPropertyTransfersService.method.getTransfersByPartyId`, and `NeighborhoodDefinition`
  with `isLegal` are all exported from the package root.
- No export name repeats across the re-exported modules, so `export *` drops nothing.
- Its `@bufbuild/protobuf` dependency is still `^2.11.0`, which Connect-Query accepts.

## Spec corrections made in this PR

The spec was written before the Civil OS features shipped. Now that they have, this
PR corrects it:

| Section | Change |
|---|---|
| Stack | Pins `@civil-labs/civil-os-api` to `0.4.0`. |
| To confirm before building | Renamed "Connect-Query and the SDK". The peer-dependency check is done (`@bufbuild/protobuf` `^2.11.0` satisfies Connect-Query's `2.x`). The remaining check, a real query against the stack, moves to PR 3. |
| Selection, Parcel location | `GetParcelExtentsWGS84ByParcelId` shipped. The map uses it first, and loaded tiles are the fallback for a parcel absent from its response. Its shape (`extents: map<string, ExtentWGS84>`) replaces the proposal. |
| Detail pane | Drops the "may be empty until the neighborhoods fix ships" caveat. The loader also prefetches the extent. |
| Land use, zoning, neighborhood | The neighborhood page lists its definitions (`neighborhoodDefinitionIds`) by name, as plain text. |
| Address and party | Replaces the placeholder pages with full pages built on the shipped RPCs. The party page also gets a transfers section, from `GetTransfersByPartyId`. |
| Open questions | The one remaining question (a possible field rename) is settled: v0.4.0 renamed the map to `neighborhoodDefinitions`, and the selector reads that field. The section now says there are none. |

`intent.md` isn't changed. Its dependency notes describe the state when it was
written.

## PR overview

| PR | Branch | Title | Depends on |
|---|---|---|---|
| 1 | `build/scaffold` | `build: scaffold Vite, React, TypeScript, StyleX and CI` | — |
| 2 | `feat/auth` | `feat: sign-in, session renewal, sign-out and navbar` | PR 1 |
| 3 | `feat/router-and-data` | `feat: routes, data layer, record links and lookup pages` | PR 2 |
| 4 | `feat/parcels-page` | `feat: parcels page with map and detail pane` | PR 3 |
| 5 | `feat/neighborhood-definition` | `feat: neighborhood definition selector` | PR 4 |
| 6 | `feat/record-pages` | `feat: transfer, address and party pages` | PR 3 (PR 4 for the shared transfers list) |
| 7 | `docs/smoke` | `docs: smoke checklist and MVP verification` | PR 6 |

PRs 4 to 6 are vertical slices, each usable in the app when merged.

## PR 1: scaffold (`build/scaffold`)

1. **`build: add Vite, React and TypeScript`**
   - `npm create vite` (React + TS), then trim it to the spec's layout. Remove the
     template's CSS files and assets.
   - `tsconfig` has `strict: true`, `noUncheckedIndexedAccess: true` and
     `verbatimModuleSyntax: true`.
   - `mise.toml` pins Node. The npm scripts are `dev` (port 3000, `strictPort`),
     `build`, `typecheck`, `lint` and `test`.
   - TypeScript is pinned to 6.0.3. `typescript-eslint` 8.73 supports
     `>=4.8.4 <6.1.0`, so TypeScript 7 waits for it (see [Risks](#risks)).
2. **`build: add StyleX`**
   - Add `@stylexjs/stylex` and `@stylexjs/unplugin`, which is the official Vite
     integration (confirmed on npm, 2026-11-17), wired into `vite.config.ts`.
   - The plugin appends StyleX's CSS to a stylesheet the bundle already has. With
     none, it writes an unlinked `assets/stylex.css`. So `src/stylex.css` is an empty
     file, imported once in `main.tsx`, for it to append to. A comment in it explains
     why. The build then emits one hashed CSS file, linked from `index.html`. The dev
     server serves StyleX's CSS through the plugin's own `virtual:stylex.css`. (The
     owner chose a real file over a virtual module, so the reason is easy to find.)
   - `tsconfig.node.json` uses `bundler` resolution, because the plugin's type
     declarations don't resolve under `nodenext`.
   - Add `src/theme/tokens.stylex.ts` with the navbar height, pane widths and spacing.
   - The root container is a fixed-to-viewport flex column, styled with StyleX (see the
     spec's [Styling](spec.md#styling)).
3. **`build: add ESLint with the StyleX and styling rules`**
   - Flat config with `typescript-eslint`, `eslint-plugin-react`,
     `eslint-plugin-react-hooks` and `@stylexjs/eslint-plugin`.
   - `no-restricted-imports` allows only `maplibre-gl/dist/maplibre-gl.css` and
     `./stylex.css` among `*.css` imports.
   - `react/forbid-dom-props` and `react/forbid-component-props` forbid `style` and
     `className`.
4. **`build: add Vitest and React Testing Library`**, with `jsdom` and one smoke test
   that renders the root.
5. **`ci: typecheck, lint, test and build on every PR`** in a GitHub Actions workflow
   using `jdx/mise-action`, so CI uses the same Node version.
6. **`docs: add README`**: what the app is, `mise install`, `npm ci`, `npm run dev`
   against the civil-os local stack, and links to `docs/mvp/`.

**Checks:**

- CI is green on the PR.
- `npm run build` emits one StyleX CSS file.
- A deliberate `style={{}}` and a `.css` import each fail lint. Shown in the PR
  description, then reverted.

## PR 2: auth (`feat/auth`)

1. **`feat: load config and instance metadata`**
   - `public/config.json` holds the dev values (`gatewayUrl`, `clientId`,
     `basemapStyleUrl`). `src/config.ts` validates it and fails loudly if it's malformed.
   - Installs `@civil-labs/civil-os-api@0.4.0`, `@connectrpc/connect` and
     `@connectrpc/connect-web` (exact versions).
   - `src/api/instance.ts` calls `GetInstanceMetadata` without a token, through a plain
     Connect client.
2. **`feat: sign in with oidc-client-ts`**
   - `src/auth.ts` sets up `UserManager` exactly as the spec's [Auth](spec.md#auth)
     says: `localStorage` user store, scope `openid profile email offline_access`.
   - `automaticSilentRenew` is **off**, not on as first written. With no
     `silent_redirect_uri`, `oidc-client-ts` defaults it to `redirect_uri`, so its
     automatic renew does an iframe renew against `/callback` when there's no refresh
     token. Renewal is done by `Auth` instead, with the refresh token only. The spec is
     corrected to match.
   - A refresh response with no `id_token` keeps the old one in `oidc-client-ts`, so a
     session is judged by the ID token's own `exp` claim.
   - The root `beforeLoad` check and the `/callback` route are added, with a minimal
     router (`/` redirects to a placeholder `/parcels`), so sign-in can be tested.
3. **`feat: renew sessions and sync tabs`**, following
   [Session renewal](spec.md#session-renewal):
   - A renewal counts only if it returns a new `id_token`.
   - Before treating a failed renewal as final, the stored user is re-read.
   - A `storage` listener keeps tabs in sync.
4. **`feat: Connect transport with the auth interceptor`**: `src/api/transport.ts`.
   An `Unauthenticated` response clears the user and calls `signinRedirect`.
5. **`feat: navbar with the user's name and sign-out`**: `components/Navbar.tsx`.
   - The name falls back from `name` to `preferred_username` to `email` to `sub`.
   - "Sign out" calls `removeUser()`, then `signinRedirect` to `/parcels`.
   - Another tab that sees the user removed redirects too.

**Unit tests:** the name fallback; the renewal rule (no `id_token` means failed); the
sign-out order; and the interceptor adding the header and handling `Unauthenticated`.

**Manual checks against the local stack.** These settle the spec's remaining Dex
questions. Results go in the PR description and later in `docs/mvp/smoke.md`.

- Sign-in works and returns to the page you started on.
- **Dex gives the public client a refresh token** with `offline_access`.
- **Dex's refresh response includes a new `id_token`.** To force it, shorten the
  token lifetime in a local, uncommitted Dex override, or wait for expiry.
- Two tabs stay signed in through a renewal.
- Sign-out in one tab sends both tabs to Dex's login.

If either Dex check fails, stop and ask the owner. The fallback, a redirect on expiry,
is already in the spec, but it changes how often users see sign-in.

## PR 3: routes, data layer, record links and lookup pages (`feat/router-and-data`)

1. **`build: add Connect-Query and TanStack Query`**: `@connectrpc/connect-query` and
   `@tanstack/react-query` (exact versions).
2. **`feat: QueryClient with the cache and retry policy`** in `src/api/queryClient.ts`:
   - the spec's `staleTime` table;
   - retries by Connect code;
   - a `QueryCache` `onError` handler for `Unauthenticated`;
   - `TransportProvider` and `QueryClientProvider` in `main.tsx`;
   - the devtools, in dev builds only.
3. **`feat: full route table with TanStack Router`** in `src/router.tsx`:
   - every route in the spec, `Register`ed, with router context
     `{ queryClient, transport }`;
   - `params.parse` UUID checks;
   - `defaultPreload: 'intent'` and `defaultPreloadStaleTime: 0`.

   Routes whose pages come in later PRs render a one-line "Not built yet". They exist
   now so `<RecordLink>` is typed against the real route table.
4. **`feat: RecordLink and the field renderer`**: `src/links.tsx` (the type-to-route
   table, plus the feature-ID helpers) and `components/Fields.tsx` (the rendering
   rule).
5. **`feat: errors and loading`**: `ErrorAlert`, the router's pending and error
   components, and Retry (`router.invalidate()` plus query reset).
6. **`feat: land use, zoning and neighborhood pages`**: `LookupPage.tsx`.
   - The three whole-table lookups, prefetched by loaders.
   - The neighborhood page lists its definitions by name.
   - This is the first real Connect-Query use against the stack, and closes the spec's
     last Connect-Query check.

**Unit tests:** `links.tsx`; `Fields.tsx`; the retry policy; `params.parse` rejecting a
non-UUID without an API call; `/` redirecting with `replace`.

**Check early in this PR:** a query whose input contains an `int64` (`bigint`) builds a
working query key. TanStack Query hashes keys with `JSON.stringify`, which throws on
`bigint`. The test calls `GetParcelIdsByFeatureId` through Connect-Query with a
`bigint` feature ID. If it throws, either a `queryKeyHashFn` that serializes `bigint`
is set on the `QueryClient`, or that call bypasses the query cache. The fix is recorded
here.

**Result (2026-11-18): no fix needed.** Connect-Query builds the key from the input's
protobuf JSON form, where an `int64` is a string, so `JSON.stringify` never sees a
`bigint`. `src/api/bigintKey.test.ts` fetches `GetParcelIdsByFeatureId` with feature ID
2^53 + 1 through a `QueryClient` and reads the same cache entry back.

**Manual:** each lookup page loads from the stack, and an unknown ID shows "Not found".

**As built:**

- `src/api/lookups.ts` holds the query options for the four whole-table reads (land
  uses, zoning, neighborhoods, definitions), so loaders and pages share one cache
  entry. The spec's code layout lists it.
- An unknown path is a catch-all `$` route inside the signed-in layout. Without it, an
  unknown path matched only the root route, outside the auth check and the navbar.
- `<RecordLink>` also treats `landUseType` and `neighborhoodDefinition` as types with
  no page, so land use types and definitions are plain text.
- `url` fields become links only for `http` and `https`, so a `javascript:` URI from
  the API stays text.

## PR 4: parcels page (`feat/parcels-page`)

1. **`feat: two-pane parcels layout`**: `ParcelsLayout.tsx` with the StyleX grid, the
   index route's empty pane, and the `$parcelId` child route.
2. **`feat: parcel map with basemap and tiles`**: `map/ParcelMap.tsx` and
   `map/style.ts`.
   - Positron from `basemapStyleUrl`, plus the four parcel layers.
   - `transformRequest` adds the token to `/tiles/` only. A tile 401 triggers sign-in.
   - If the style fails, fall back to an empty style.
   - Import `maplibre-gl.css` here.
3. **`feat: instance bounds and starting view`**: `map/bounds.ts`. Metadata bounds,
   falling back to the extent RPC; `maxBounds` (see the spec); fit the bounds when nothing
   is selected.
4. **`feat: select a parcel by clicking`**: `GetParcelIdsByFeatureId`, then navigate,
   pushing a history entry.
5. **`feat: parcel detail pane`**: `ParcelPane.tsx`.
   - The parcel query, with no definition yet (PR 5 adds it).
   - Links, "No parcel with this ID", and pane-scoped pending and error states.
6. **`feat: transfers on the parcel pane`**: a reusable `TransfersList`
   (`useInfiniteQuery`, "More"), used again in PR 6.
7. **`feat: highlight and center the selected parcel`**: `map/selection.ts`.
   - The extent query, with the tile fallback and the "Location not loaded" note.
   - The camera rule and the highlight filter.
   - The map stays mounted across selections.

**As built (steps 1–3):**

- Routes that lay out the whole area below the navbar set `staticData.fullBleed`; the
  signed-in `<main>` then drops its padding and scrolling. The router context gains
  `config` and `instance`, for the map.
- MapLibre 6 finds its worker next to its own module, which the bundle doesn't have.
  `setWorkerUrl` points it at the worker Vite emits (`?url`), so it loads same-origin as
  a module worker, with no `blob:` URL for the CSP to allow.
- `maxBounds` covers the fitted view as well as the bounds, plus half that view on each
  side (spec corrected). Padding the bounds alone by 10% forced a zoom-in on the
  synthetic instance (tall, in a wide pane), cutting off its top and bottom rows, and
  kept an edge parcel from being centered.
- `src/map/tiles.ts` holds the tile URL and `transformRequest`, and `src/api/parcels.ts`
  the parcel query options.

**As built (steps 4–7):**

- A map click's one-line notes ("This map feature has no parcel record.", a failed
  lookup, "Location not loaded…") are shown by `ParcelsLayout` at the top of the pane,
  as `role="status"`. Each belongs to the selection it was raised under and goes away
  with it.
- `Fields` gains a `records` kind for lists of IDs (`partyIds`, `zoningIds`,
  `improvementIds`).
- The first transfers page leaves `after` unset (spec corrected): the gateway rejects an
  empty cursor, though Connect-Query types the page-param field as required.
- `TransfersList.tsx` lives in `components/`, since the party page will use it too.
- Selection waits for the map's `load`, after `maxBounds` is set, then reads the parcel
  and its extent through `queryClient.fetchQuery`, which shares the loader's requests.
- Dev only: the lazy devtools import is aborted when the first load redirects to
  sign-in; the loader now renders nothing on failure instead of an uncaught error.
- `src/test/fixtures.ts` is a fake Civil OS (`createRouterTransport`) with synthetic
  records, for page tests.

**Unit tests:** `bounds.ts`; `selection.ts` (merging clipped boxes; the three camera
cases); `transformRequest` and the tile URL; and the routing test that the layout
isn't remounted between `/parcels/A`, `/parcels/B` and `/parcels`.

**Manual:**

- Click a parcel: the URL changes, the pane fills, and the parcel is highlighted and
  centered.
- Reload: the same view comes back, centered by the extent.
- Back retraces the selection.
- A voided or unknown parcel ID shows "No parcel with this ID".
- The basemap is blank (open ocean) under the synthetic parcels.

## PR 5: neighborhood definition selector (`feat/neighborhood-definition`)

1. **`feat: neighborhood definition store`**: `src/neighborhoodDefinition.ts`.
   - In memory, mirrored to `localStorage` with `try`/`catch`.
   - `useSyncExternalStore`, a `storage` listener, and the default rule (stored choice,
     then the first by name).
2. **`feat: load neighborhood definitions on app load`**: the root loader's
   `ensureQueryData`, with `staleTime` and `gcTime` both `Infinity`.
3. **`feat: neighborhood definition selector`**: `NeighborhoodDefinitionSelect.tsx` at
   the top of the pane, with its loading, error and empty states.
4. **`feat: read parcels under the selected definition`**:
   - The parcel query and loader pass `neighborhoodDefinitionId`.
   - `keepPreviousData`, with the neighborhood field showing "Loading…" while it
     refetches.

**As built:**

- The app route's loader uses `prefetchQuery`, not `ensureQueryData`, so a failed
  definitions call leaves the app working, as the spec requires. The `$parcelId` loader
  awaits the same request before choosing, since loaders run in parallel (spec updated).
- The pane reads the parcel with `useQuery` and a same-parcel `placeholderData` (spec
  updated): `useSuspenseQuery` would suspend on the new key, and `keepPreviousData`
  would show the last parcel while another loads.
- The store is in the router context as `definitionChoice`; `currentDefinitionId`
  applies it to the cached definitions for loaders and the map.
- `renderApp` now builds the app's own `createQueryClient` (retries off), so tests run
  with the real cache policy. A plain client's `staleTime: 0` made the pane refetch what
  the loader had just fetched.

**Unit tests:** the store's default rule, throwing storage, and cross-tab updates;
changing the definition refetches only the parcel query.

**Manual:**

- Switch definitions: the parcel's neighborhood changes.
- The choice survives going to a transfer and back, a reload, and a new tab.
- A second open tab follows a change.

## PR 6: transfer, address and party pages (`feat/record-pages`)

1. **`feat: transfer page`**: `TransferPage.tsx`, with fields, recordings, codes, and
   the parcels, improvements and parties sections.
2. **`feat: address page`**: `AddressPage.tsx`, with fields and the three paginated
   reverse-lookup sections.
3. **`feat: party page`**: `PartyPage.tsx`, with fields, a mailing address link, and
   the parcels (with share) and transfers sections. Transfers reuse `TransfersList`.

**As built:**

- `components/PagedList.tsx` holds what every paginated section shares (the unset
  first-page cursor, loading, error, "None." and "More"); `TransfersList` and the five
  address and party sections use it.
- Each record page's not-found message is its route's `notFoundComponent`, so a
  malformed ID in its path shows the same message, as on the parcels page. The transfer
  page says "No transfer with this ID" (spec added: the spec gave none).
- A party's mailing address with no `mailingAddressId` is plain text.
- `NotBuiltYet` is removed; every route has its page.

**Unit tests:** each page's not-found state; the address page's country and
administrative-area formatting.

**Manual,** using the civil-os fixtures that cover these cases:

- A transfer with several grantors and grantees, and one with several parcels.
- A party with several parcels at different shares.
- An address shared by a parcel and a party's mailing address.

Each hop is one click, and Back retraces it.

## PR 7: smoke checklist and verification (`docs/smoke`)

1. **`docs: smoke checklist for the MVP`**: `docs/mvp/smoke.md`. It walks every
   success criterion in the intent against the local stack, and records the Dex
   results from PR 2.
2. The agent runs the checklist end to end, and puts the results in the PR description.

## Final verification (before reporting the MVP done)

- `npm run typecheck`, `npm run lint`, `npm test` and `npm run build` pass on `main`
  after PR 7.
- Every item in `smoke.md` passes against a fresh `mise run up`.
- The production build has no inline scripts or styles, so a CSP of `script-src 'self';
  style-src 'self'` is enough. Check this by serving `dist/` with that CSP header from
  a local static server.

## Risks

| Risk | Mitigation |
|---|---|
| Dex doesn't issue a refresh token to a public client, or doesn't return an `id_token` on refresh | Found in PR 2's manual checks. The spec's fallback (a redirect on expiry) already works. Stop and ask the owner. |
| `bigint` in query keys | Tested first thing in PR 3, with the fixes listed there. |
| TypeScript 7 (current on npm) isn't yet supported by `typescript-eslint` | Pin the newest TypeScript that `typescript-eslint` supports, and note the version in PR 1. |
| `@stylexjs/unplugin` doesn't work with the current Vite major | Found in PR 1. Pin the Vite major the plugin supports. |
| MapLibre's `querySourceFeatures` returns tile-clipped pieces | `selection.ts` merges them. Since the extent RPC is used first, this only matters for the fallback. |

## Out of scope for this plan (per spec)

- Editing of any kind.
- Packaging, the static-server image, the CSP headers in production, and the Helm
  chart. These get their own doc.
- Search and lists, valuations, and history or as-of views.
