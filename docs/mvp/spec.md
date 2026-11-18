# Spec: Record Keeper MVP

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-15 |
| **Status** | Draft. Accepted when merged, after [`intent.md`](intent.md). |
| **Intent** | [`intent.md`](intent.md) |

This spec sets out the contract for the MVP: stack, config, auth, routes, what
each page shows, and how it's tested. The order of the work goes in `plan.md`.

## Stack

| Concern | Choice | Why |
|---|---|---|
| Build | Vite + TypeScript (`strict`) | The SDK's types come from the Civil OS protos, so a renamed field breaks the build, not the page. |
| UI | React, no component kit | The edit phase needs forms and state. The MVP renders plain HTML elements. |
| Styling | StyleX (`@stylexjs/stylex`), with its official Vite integration | Styles are typed and live next to the components that use them. They compile to one static, atomic CSS file at build time, with no runtime style injection, so the CSP needs no `'unsafe-inline'`. See [Styling](#styling). |
| Routing | `@tanstack/react-router` (pinned to an exact version), with routes defined in code | Every record gets a real, shareable URL, and Back works. Route paths, params and search params are type-checked, so a broken link is a compile error. Loaders share the TanStack Query cache. |
| Data | `@tanstack/react-query` + `@connectrpc/connect-query` | One shared cache for lookups, cursor pagination for transfers, per-section loading and errors, and one retry policy based on Connect error codes. For the edit phase it adds mutations, invalidation and refetch on focus. Connect-Query builds typed queries and keys from the SDK's method descriptors (see [Data fetching](#data-fetching)). |
| API client | `@civil-labs/civil-os-api` (exactly `0.4.0`, public-api v0.4.0), `@connectrpc/connect`, `@connectrpc/connect-web` | The published, generated client. Connect JSON over `fetch`. 0.3.0 added the address, party, parcel-extent, transfers-by-party and neighborhood-definition reads this spec uses; 0.4.0 renamed `GetNeighborhoodDefinitionsResponse`'s map to `neighborhoodDefinitions`. |
| Map | `maplibre-gl` | Renders a basemap style, with the Civil OS MVT parcel tiles on top. |
| Auth | `oidc-client-ts` | Authorization code + PKCE in the browser, against any OIDC issuer. |
| Tests | `vitest` | Unit tests for the pure helpers. |

**No other runtime dependencies.** Adding one needs a reason in the PR.

`mise.toml` pins `node = "22.23.4"`, to match civil-os. The npm scripts are `dev`,
`build`, `typecheck`, `lint` and `test`.

## Config

`public/config.json` is fetched once at startup. It's the only thing that
differs between deployments, so one built image serves any instance.

```json
{
  "gatewayUrl": "http://localhost:8080",
  "clientId": "civil-os-dev",
  "basemapStyleUrl": "https://tiles.openfreemap.org/styles/positron"
}
```

- **`basemapStyleUrl`** is the MapLibre style JSON URL for the basemap. Every
  deployment uses OpenFreeMap Positron (see [Basemap](#basemap)). It's still a config
  value rather than hard-coded, so moving to a different style later doesn't need a
  rebuild.

- **The issuer isn't configured.** The app reads it from
  `InstanceService/GetInstanceMetadata` (`authIssuerUrl`), which needs no auth.
- **Every deployment's `clientId` must be allowed by the gateway.** It has to appear in
  that instance's `CIVIL_OS_GATEWAY_ALLOWED_CLIENT_IDS`, or the gateway rejects every
  request.
- **Dev runs on the Vite dev server, port 3000.** It uses the local Dex client
  `civil-os-dev`, whose registered redirect is `http://localhost:3000/callback`.

These are the civil-os local-stack values: the compose stack publishes the
gateway on `127.0.0.1:8080` and Dex on `127.0.0.1:5556`.

## Auth

1. **At startup:** load the config, call `GetInstanceMetadata`, and set up an
   `oidc-client-ts` `UserManager` with:
   - `authority` = `authIssuerUrl`;
   - `client_id` from the config;
   - `redirect_uri` = `{origin}/callback`;
   - `response_type: code`, and scope `openid profile email offline_access`.
     `offline_access` asks for a refresh token. Dex issues one only when it's requested.
   - `userStore: new WebStorageStateStore({ store: window.localStorage })`, so a session
     survives new tabs and browser restarts until its tokens expire;
   - `automaticSilentRenew: true`, with no `silent_redirect_uri` (see
     [Session renewal](#session-renewal)).
2. **Before any route renders:** if there's no unexpired user, call `signinRedirect`,
   saving the current URL in `state`. `/callback` finishes the sign-in and returns the
   user to that URL.
3. **One Connect interceptor** adds `Authorization: Bearer <id_token>` to every RPC.
   - The gateway checks `aud` against the allowed client IDs, so the token sent is
     the **ID token**.
4. **The map's `transformRequest`** adds the same header to requests that start
   with `{gatewayUrl}/tiles/`, and to no other URL. In particular, the token is never
   sent to the basemap's host.
5. **An `Unauthenticated` Connect error, or a 401 on a tile,** clears the user and
   starts a new sign-in.

`GetInstanceMetadata` is the only call made without a token.

### The sign-in redirect

`signinRedirect` is the `oidc-client-ts` `UserManager` method that sends the browser,
as a full-page navigation, to the IdP's `authorization_endpoint` (from its discovery
document). It sends `client_id`, `redirect_uri`, `scope`, a PKCE `code_challenge`, and
`state` holding the app URL to return to. The IdP signs the user in and redirects to
`/callback` with a code. `signinRedirectCallback` exchanges the code for tokens, and the
app navigates to the URL saved in `state`.

It's the app's only redirect to the IdP. It's used for first sign-in, for a failed
renewal, and after sign-out.

### Session renewal

**Refresh tokens are used if the IdP issues them.** Whether there is one is decided
by the sign-in response, not by config.

- **With a refresh token:** `automaticSilentRenew` uses the refresh-token grant shortly
  before the tokens expire. No redirect and no iframe are involved.
  - The gateway needs an **ID token**, so a renewal only counts if its response
    includes a new `id_token`. If it doesn't, and the stored ID token has expired, it's
    treated as a failed renewal.
- **Without a refresh token,** or when renewal fails: no iframe-based silent renew is
  attempted. That needs a `silent_redirect_uri` and third-party cookies, which
  browsers increasingly block. The app clears the user and calls `signinRedirect` on
  the next request that needs a token, keeping the current URL in `state`. Against the
  IdP's own session, this is usually an instant round trip.
- **Several tabs share one stored user** through `localStorage`.
  - Each tab listens for the `storage` event on the user key, and reloads the user
    when another tab renews it.
  - Before treating a failed renewal as final, a tab re-reads the stored user. Another
    tab may already have rotated the refresh token, and a renewal with the old one
    fails.
### Sign-out

The navbar's "Sign out" does two things:

1. **Clear the app's session** with `removeUser()`. This removes the stored user from
   `localStorage`, and other tabs see that through the `storage` event.
2. **Send the user straight to sign-in** with `signinRedirect`, returning to `/parcels`.

There's no signed-out page and no IdP logout call.

- **Dex has no session of its own to end.** A production Dex discovery document
  (checked 2026-11-15) advertises no `end_session_endpoint`. The app's tokens are
  the whole session.
- **The refresh token doesn't need revoking** (Dex has no `revocation_endpoint`
  anyway). `removeUser()` deletes it from the browser, and the authorize request doesn't
  carry it, so after sign-out the user has to sign in again.
- **Other tabs:** when a tab sees the stored user removed, it calls `signinRedirect`
  itself, returning to its own current URL.

**IdP client registration:** the OIDC client must allow `{origin}/callback` as a
redirect URI.

### What Dex supports

From the same production discovery document. These facts shape the auth design above:

| Discovery field | Value | Effect on the app |
|---|---|---|
| `grant_types_supported` | `authorization_code`, `refresh_token` | Code flow and refresh-token renewal are both available. |
| `scopes_supported` | includes `offline_access` | Requesting it should return a refresh token. |
| `code_challenge_methods_supported` | `S256`, `plain` | PKCE uses `S256` (the `oidc-client-ts` default). |
| `token_endpoint_auth_methods_supported` | `client_secret_basic`, `client_secret_post` | `none` isn't listed, but a browser app can't hold a secret. The Record Keeper client must be registered in Dex as a **public client** (`public: true`), which Dex lets exchange a code with PKCE and no secret. |
| `claims_supported` | includes `name`, `preferred_username`, `email` | The navbar's name fallback is `name`, then `preferred_username`, then `email`, then `sub`. |
| `end_session_endpoint`, `revocation_endpoint` | absent | Sign-out clears the app's session, then redirects to sign-in (see [Sign-out](#sign-out)). |
| `introspection_endpoint` | present | Not used. Introspection is for resource servers, not browser clients. |

**Still to confirm against the local stack,** which runs the same Dex:

- a public client gets a refresh token when it requests `offline_access`;
- the refresh response includes a new `id_token`, which the gateway needs (see
  [Session renewal](#session-renewal)).

### Security of `localStorage`

Tokens in `localStorage`, including a refresh token, can be read by any script running
on the page. A refresh token copied out of the browser before sign-out stays usable
until Dex expires it, because deleting it locally doesn't invalidate it at Dex. The app reduces that risk:

- It loads no third-party scripts. Everything is bundled, and the basemap is data,
  not code.
- It's served with a strict Content-Security-Policy: `script-src 'self'` and
  `style-src 'self'` (StyleX emits a static CSS file), with `connect-src` limited to the
  gateway, the issuer and the basemap hosts. This is set in the packaging doc.
- It relies on Dex's refresh-token rotation, which is on by default, so a stolen refresh
  token stops working once the app or the attacker uses it. Whichever side loses
  the race is forced to sign in again.
- It relies on reasonable refresh-token lifetimes in each Dex deployment's config
  (`expiry.refreshTokens`: `validIfNotUsedFor`, `absoluteLifetime`). That's a deployment
  setting, outside this repo.

## Data fetching

Every RPC the app makes, except `GetInstanceMetadata` at startup, goes through
TanStack Query, using Connect-Query to build the queries.

- **No hand-written query keys or fetchers.** Calls name an SDK method descriptor and
  its input:

  ```ts
  import { ParcelsService } from "@civil-labs/civil-os-api";
  useSuspenseQuery(
    ParcelsService.method.getParcelsWithImprovementSummaryByParcelId,
    { parcelIds: [parcelId] },
  );
  ```

  Connect-Query derives the query key from the service, method, input and transport.
  The same call made from a loader (`createQueryOptions` + `ensureQueryData`) and from a
  page hits the same cache entry, so keys can't drift apart.
- **One transport.** `TransportProvider` wraps the app with the Connect transport from
  `api/transport.ts`, which carries the auth interceptor. Router loaders get the same
  transport from router context.
- **Cache policy:**

  | Data | `staleTime` | Why |
  |---|---|---|
  | Lookups (land uses, zoning, neighborhoods) | `Infinity` for the session | Whole-table reads that rarely change. Fetched once, then shared by link labels and lookup pages. |
  | Neighborhood definitions | `Infinity`, and `gcTime: Infinity` | Fetched once on app load for the parcels page's selector, and never refetched or dropped while the app is open. |
  | Records (parcel, transfer) | 30 s | Short enough that a page reopened later refetches. The edit phase depends on this, because several staff edit the same records. |

  `refetchOnWindowFocus` stays on, its default, for records.
- **Pagination:** transfers use `useInfiniteQuery` with `pageParamKey: "after"`, and
  `getNextPageParam` returns `pageInfo.endCursor` when `hasNextPage` is set. Pages already
  loaded stay cached when the user leaves and comes back.
- **One retry policy,** set on the `QueryClient` defaults:
  - retry `Unavailable`, `DeadlineExceeded` and `ResourceExhausted` up to 3 times, with
    backoff;
  - never retry `Unauthenticated`, `PermissionDenied`, `NotFound`, `InvalidArgument` or
    `FailedPrecondition`;
  - an `Unauthenticated` error from any query starts a new sign-in, through a
    `QueryCache` `onError` handler.
- **Devtools:** `@tanstack/react-query-devtools` and `@tanstack/react-router-devtools`,
  loaded only in dev builds. They're dev dependencies, not runtime ones.
- **Edit phase (not in the MVP):** writes use Connect-Query's `useMutation(method)`. On
  success they invalidate by service or method, so every page showing that record
  refreshes.

### Connect-Query and the SDK

Connect-Query v2 accepts protobuf-es v2 method descriptors directly, without the separate
`protoc-gen-connect-query` codegen step. Confirmed while planning (2026-11-17):

- `@civil-labs/civil-os-api` is generated with protobuf-es v2, which writes each service's
  descriptor (`ParcelsService` and the others) into its `_pb.js` file. The package root
  re-exports every public `_pb.js` module (`sdk/js/scripts/gen-index.mjs`), so the
  descriptors can be imported from `@civil-labs/civil-os-api`.
- Its `@bufbuild/protobuf` dependency (`^2.11.0`) satisfies Connect-Query's peer
  dependency (`@bufbuild/protobuf` `2.x`).

What remains is checked by the first real query against the local stack, in the plan.

## Routes

| Route | Page |
|---|---|
| `/` | Redirects to `/parcels` (replacing the history entry) |
| `/parcels` | Parcels: the map, with an empty detail pane |
| `/parcels/:parcelId` | Parcels: the map, with that parcel selected and its details in the pane |
| `/addresses/:addressId` | Address |
| `/parties/:partyId` | Party |
| `/transfers/:transferId` | Transfer |
| `/land-uses/:landUseId` | Land use |
| `/zoning/:zoningId` | Zoning |
| `/neighborhoods/:neighborhoodId` | Neighborhood |
| `/callback` | OIDC sign-in redirect target |
| anything else | "Not found" plus a link to `/parcels` |

### Router setup

- **Routes are defined in code**, in one file (`src/router.tsx`), with
  `createRootRouteWithContext`, `createRoute` and `createRouter`. There's no file-based
  routing and no generated `routeTree.gen.ts`. The whole route table is readable in one
  place.
- **The router is registered once** (`declare module '@tanstack/react-router' { interface
  Register { router: typeof router } }`), so `Link`, `useParams` and `useSearch` are typed
  everywhere.
- **Router context** carries `{ queryClient, transport }`. Loaders get both from
  context, not from module globals.
- **Auth is a `beforeLoad` on the root route.** It sends the user to sign-in, as described
  under [Auth](#auth). `/callback` sits outside that check.
- **Path params are UUIDs.** Each record route's `params.parse` checks the UUID format,
  and a bad ID shows the route's "Not found" without calling the API.
- **`/` redirects.** Its `beforeLoad` throws `redirect({ to: "/parcels", replace: true })`,
  so Back never lands on a blank `/`.
- **`/parcels` is a layout route.** Its component renders the map in the left pane and an
  `<Outlet />` in the right pane. It has two children:
  - an index route (`/parcels/`), which renders an empty pane;
  - `$parcelId` (`/parcels/:parcelId`), which renders the parcel's details.

  Because the map belongs to the layout, **it stays mounted** when the selection changes.
  Moving between parcels, or back to no selection, never recreates the map or reloads
  its tiles. The map reads the selected ID with `useParams({ strict: false })`.
- **No search params in the MVP.** The selection lives in the path. Feature IDs and the
  map's camera aren't in the URL. Transfer cursors stay in component state. Later URL
  state is added per route with `validateSearch`, written as a plain function with no
  schema library, and typed when it's added: `valuationId`, `legalAsOf`, filters and
  edit state.
- **Loaders prefetch, and pages read from the cache.** Each record route's `loader` calls
  `queryClient.ensureQueryData(createQueryOptions(method, input, { transport }))` with
  the same method and input the page uses (see [Data fetching](#data-fetching)). Data loads
  as soon as navigation starts, and Back and forward are served from the cache. Pages read
  data with `useSuspenseQuery`, or `useQuery` for secondary sections. The router's
  `defaultPreloadStaleTime` is `0`, so TanStack Query alone decides whether data is fresh.
- **Preloading links:** `defaultPreload: 'intent'`, so hovering a link starts loading that
  record.
- **Pending and error UI** come from the router: `defaultPendingComponent` ("Loading…")
  and an `errorComponent` per route (see [Errors and loading](#errors-and-loading)).

### Navbar

A simple navbar sits at the top of every page. It's rendered once, by the root route's
component, above its `<Outlet />`. `/callback` sits outside it, since nobody is signed
in there yet.

| Left | Right |
|---|---|
| "Record Keeper", a `<Link>` to `/parcels` | The signed-in user's name, then "Sign out" |

- **The user's name** is plain text. It comes from the ID token's claims: `name`,
  falling back to `preferred_username`, then `email`, then `sub`. Dex supplies these
  through the `profile` and `email` scopes the app already requests. It updates when a
  renewal or another tab changes the stored user.
- **"Sign out"** looks like a link, but it's a `<button>`, because it triggers an action
  rather than navigating. It runs the steps under [Sign-out](#sign-out).
- It's a `<nav>` element, one line high, with the app name at one end and the user's
  name and "Sign out" at the other. Its styles are in `components/Navbar.tsx`.
- Nothing else goes in it for the MVP: no user menu, no search, no active-page
  styling.

Nothing else is shared between pages.

## Pages

### Rendering rule

Every record page has the same parts:

- an `<h1>` that names the record type and its best label, such as
  "Parcel: 100 Example St";
- a `<dl>` of fields, in the order the proto defines them;
- then a `<section>` for each list of related records, such as transfers.

How a field is shown:

| Field holds | Shown as |
|---|---|
| The UUID of a type with a route | A `<Link>` to that route. The link text is the record's label when it's already known (for example a land use name from the lookup), otherwise the UUID. |
| The UUID of a type with no route (improvements, improvement types and conditions) | Plain text |
| A decimal string or number | As returned, with no formatting |
| A timestamp | ISO 8601 |
| An empty optional field | `—` |
| `properties` (a JSON string) | A `<pre>` of the JSON, pretty-printed |

**All record links go through one component.** `<RecordLink type id label?>` maps an
entity type to its typed TanStack Router `<Link to="/parcels/$parcelId" params={...}>`.
For a type with no page, it renders plain text. The mapping from type to route is one
typed table, so adding a route for improvements later turns their IDs into links
everywhere at once. No page builds a URL string by hand.

### Parcels (`/parcels` and `/parcels/:parcelId`)

This is the app's home page. The map is on the left, and the selected parcel's
details are in a pane on the right.

#### Layout

- A two-column grid, styled with StyleX in `routes/ParcelsLayout.tsx`: the map takes
  the remaining width, and the pane is `minmax(360px, 40%)`. Together they fill the
  viewport height below the navbar.
- The pane scrolls on its own; the map never scrolls.
- Nothing else is styled beyond what [Styling](#styling) allows.

#### Map

**Layers,** from bottom to top:

| Layer | Source | Style |
|---|---|---|
| Basemap | The style at `basemapStyleUrl` | As the style defines it |
| `parcels-fill` | Vector source `parcels`: tiles `{gatewayUrl}/tiles/get_parcel_tiles/{z}/{x}/{y}`, source layer `parcels` | Fill, opacity 0. Exists only so clicks hit the whole parcel. |
| `parcels-line` | Same | Dark gray line, 1 px |
| `selected-fill` | Same, filtered to the selected feature | The highlight color at 30% opacity |
| `selected-line` | Same, filtered to the selected feature | The highlight color, 3 px |

- The parcel layers are added on the style's `load` event, above every basemap layer.
- **The highlight color** is one constant in `map/style.ts`. It's a saturated orange
  (`#f97316`), chosen to stand out against a light basemap and the gray parcel lines.
- **When nothing is selected,** the `selected-*` filters match nothing.

**Bounds and starting view:**

- The bounds come from `GetInstanceMetadata.metadata.bounds` (`west, south, east,
  north`).
  - These keys are a convention in the instance metadata, not a proto contract. If
    `bounds` is missing or malformed, the app calls
    `ParcelsService/GetEstimatedParcelsExtentWGS84` and uses `minX, minY, maxX, maxY`.
  - If both fail, the map pane shows the error and no map. The detail pane still
    works.
- `maxBounds` is the bounds expanded by 10% on each side. The slack lets a parcel on
  the edge of the jurisdiction be centered.
- **With no parcel selected,** the map starts centered on the center of the bounds,
  zoomed so the whole bounds fit.
- **With a parcel selected,** the map starts on that parcel (see [Selection](#selection)).

**Click:** the feature's `id` is its `feature_id`.

1. Call `ParcelsService/GetParcelIdsByFeatureId` with `featureIds: [BigInt(id)]`.
2. Navigate to `/parcels/{parcelIds[id]}`. This pushes a history entry, so Back
   returns to the previous selection.

- A click on the selected parcel does nothing.
- A click on empty map changes nothing.
- If the feature has no parcel ID, the detail pane shows a one-line message.

#### Selection

A parcel is selected when its ID is in the path. Selection is driven only by the
route, whether it came from a map click, a link from another page, Back/forward, or a
reload.

When `parcelId` changes:

1. **Find the feature.** Read `featureId` from the parcel's `ParcelDetails`, through
   the same query the detail pane uses, so there's no extra request. This is the
   current legal geometry's feature, so it matches the geometry in the current tiles.
2. **Highlight it.** Set the `selected-*` layer filters to
   `["==", ["id"], Number(featureId)]`.
3. **Center it.**
   - Find the parcel's bounding box: the [parcel extent](#parcel-location) from Civil
     OS. If the parcel is absent from that response, merge the boxes of every
     tile-clipped piece that
     `querySourceFeatures("parcels", { sourceLayer: "parcels", filter })` returns.
   - Move the camera with `easeTo`:
     - **center:** the middle of the box;
     - **zoom:** the lower of (a) the zoom at which the box fits the map with 48 px
       padding (`cameraForBounds`) and (b) the current zoom or the instance's
       `default_zoom` (fallback 17), whichever is higher.

     This means browsing at street level keeps the zoom, while a parcel opened from a
     zoomed-out map or a link zooms in to it. A parcel too big for the current view
     zooms out until it fits.

**When the selection is cleared** (going back to `/parcels`), the highlight is removed
and the camera stays where it is.

**If the parcel has no `featureId`** (no current geometry), nothing is highlighted, the
camera doesn't move, and the pane says "This parcel has no map geometry."

#### Parcel location

The map finds a parcel with `ParcelsService/GetParcelExtentsWGS84ByParcelId`
(`parcelIds: [parcelId]`, no `legalAsOf`). It returns `extents`, a map from parcel ID
to `ExtentWGS84` (`minX, minY, maxX, maxY`), the bounding box of the parcel's current
geometry.

- It's a separate query from the parcel details, with `staleTime` like the other
  records. Both start in the `$parcelId` route's loader, so they run in parallel.
- **A parcel absent from `extents`** (unknown, voided, or with no geometry) falls back
  to the loaded tiles: after the map is `idle`, try `querySourceFeatures`.
  - If the parcel is found, center it.
  - If not, highlight it anyway, leave the camera where it is, and put a one-line note
    in the pane: "Location not loaded. Zoom in to find it on the map." The highlight
    shows up as soon as its tile loads.
- **If the extent request fails,** the same fallback is used, and the error isn't
  shown. The parcel's details are unaffected.

#### Basemap

**The basemap is OpenFreeMap Positron**
(`https://tiles.openfreemap.org/styles/positron`), in every environment. The parcel
layers are added on top of it.

- **Why this one:**
  - It's free, needs no API key, and has no usage limits, so there's no key in public
    config and no billing.
  - Its light, low-contrast look keeps parcel lines and the highlight readable.
- **Attribution:** keep MapLibre's attribution control on. It shows the
  OpenFreeMap / OpenMapTiles / OpenStreetMap credits that the style declares, as their
  licenses require.
- **What OpenFreeMap sees:** viewers' browsers fetch basemap tiles from OpenFreeMap
  directly, so it sees their IP addresses and which areas they view. It never receives
  the Civil OS token or any parcel data (see [Auth](#auth)).
- **If OpenFreeMap is down,** the basemap is blank but the parcel layers still draw,
  because they don't depend on it. If the style JSON itself fails to load, the parcel
  layers are added to an empty style, so the map still works without a basemap.
- **Synthetic data:** the civil-os synthetic fixtures sit in open ocean, so in local
  development the basemap shows only water under the parcels. That's expected.

**Feature IDs are 64-bit integers, and never appear in URLs.** The SDK (protobuf-es
v2) types `int64` as `bigint`, and MapLibre gives a `number`. The IDs fit in 2^53, so
converting with `BigInt(n)` and `Number(b)` is safe. Do the conversion in one helper
and nowhere else. A feature ID belongs to one geometry version: redrawing a parcel
gives it a new feature ID, so URLs carry only parcel UUIDs.

#### Neighborhood definition selector

A parcel's neighborhood depends on which neighborhood definition it's read under.
The parcels page has a dropdown to choose that definition.

**Placement:** at the top of the detail pane, above the parcel's details. It's part of
`ParcelsLayout`, not of the `$parcelId` route, so it's there whether or not a parcel is
selected, and it doesn't re-render when the selection changes.

```html
<label>Neighborhood definition <select>…</select></label>
```

It uses browser-default form styling. Its only StyleX is the spacing that separates it
from the details below.

**Options:**

- **Source:** `NeighborhoodService/GetNeighborhoodDefinitions`, fetched once **on app
  load**. The definitions are the response's `neighborhoodDefinitions` map, keyed by ID. The root route's loader calls `ensureQueryData` for it after the auth check,
  since the call needs a token.
- **Caching:** the query is cached with `staleTime: Infinity` and `gcTime: Infinity`, so
  it's never refetched or dropped while the app is open.
- **Labels and order:** one `<option>` per definition, labeled with its `name`, valued
  with its ID, and sorted by name.
- **No "none" option.** A definition is always selected when any exist.
- **While the definitions load,** the select is disabled and shows "Loading…".
- **If the call fails,** the select is replaced by the error (see
  [Errors and loading](#errors-and-loading)), and parcels are read with no definition,
  so their neighborhood is empty.
- **If there are no definitions,** the select is replaced by "No neighborhood
  definitions", and parcels are read with no definition.

**Which definition is selected:**

1. **The stored choice,** if it's still among the returned definitions.
2. **Otherwise, the first definition by name.**

The default from step 2 isn't stored. Only a choice the user makes is stored, so the
default can change when the definitions change.

**Persistence.** The choice is kept as long as the browser allows, across pages,
reloads, new tabs and browser restarts:

- **Store:** `src/neighborhoodDefinition.ts` holds the selected ID in memory, and mirrors
  it to `localStorage` under `recordKeeper.neighborhoodDefinitionId`.
  - Every `localStorage` read and write is wrapped in `try`/`catch`. If storage is
    unavailable (private mode, blocked site data), the choice lives in memory for the
    session and nothing breaks.
- **Hooks:** components read the choice with `useSyncExternalStore` over that store.
  Loaders read it directly from the store, outside React.
- **Other tabs:** the store listens for the `storage` event, so changing the definition
  in one tab updates the others.
- **Not in the URL.** It's a viewing preference, not part of which record is shown, and
  the parcel URL stays the shareable identity of the record. Someone opening a shared
  link sees the parcel under their own stored definition.

**Changing the definition** stores the new ID. The parcel is then refetched under it:

- The parcel query's input includes `neighborhoodDefinitionId` (see
  [Detail pane](#detail-pane)). Connect-Query's key includes the input, so a new
  definition is a new query and is fetched.
- Each definition's result stays cached, so switching back to a definition already
  viewed is instant.
- While the new result loads, the pane keeps showing the previous result
  (`placeholderData: keepPreviousData`), with the neighborhood field showing
  "Loading…". It doesn't flash back to the pane's "Loading…" state.
- Only the parcel query changes. The map, the transfers section and the lookups don't
  depend on the definition and aren't refetched.

#### Detail pane

**With no parcel selected,** the pane shows only the neighborhood definition selector.

**With a parcel selected,** the pane shows the parcel, following the
[rendering rule](#rendering-rule).

**Data:**

- `ParcelsService/GetParcelsWithImprovementSummaryByParcelId` with
  `parcelIds: [parcelId]` and `neighborhoodDefinitionId` set to the selected definition
  (see [Neighborhood definition selector](#neighborhood-definition-selector)). The field
  is left unset when no definition is available.
  - There's no `valuationId`, so the valuation fields are empty (see Non-goals in the
    intent).
  - `neighborhoodId` is the parcel's neighborhood under the selected definition, or
    empty if it has none there.
- The lookups for land use, zoning and neighborhood names.

**Fields:** every `ParcelDetails` field, then every `ParcelImprovementsSummary` field.

**Links:**

| Field | Goes to |
|---|---|
| `addressId` | `/addresses/:id` |
| each `partyIds` entry | `/parties/:id` |
| `landUseId` | `/land-uses/:id` |
| each `zoningIds` entry | `/zoning/:id` |
| `neighborhoodId` | `/neighborhoods/:id` |

`featureId` is shown as plain text, since the map already shows the parcel.

**Loader:** the `$parcelId` route prefetches the parcel, with the selected definition
read from the store, its extent (see [Parcel location](#parcel-location)), and the
lookups (land uses, zoning, neighborhoods) with `ensureQueryData`. It waits for the definitions query from the root loader first, so the
selection is settled before the parcel is requested. It doesn't wait for transfers; that
section loads on its own. Its pending and error components render **inside the pane**,
so the map stays visible and usable while a parcel loads or fails.

**Transfers section:**

- Data: `RealPropertyTransfersService/GetTransfersByParcelId` with
  `parcelIds: [parcelId]`, `first: 25`.
- Shown as a table of time, amount and a link to `/transfers/:id`.
- When `pageInfo.hasNextPage` is set, a "More" button fetches the next page with
  `after: endCursor`, through `useInfiniteQuery`.

**Not found:** a parcel ID missing from the response map shows "No parcel with this ID"
in the pane, since it may be voided or may not exist. Nothing is highlighted.

### Transfer (`/transfers/:transferId`)

**Data:** `RealPropertyTransfersService/GetTransfersById` with
`transferIds: [transferId]`, prefetched by the route's loader.

**Fields:** time, amount, recordings (book, page, and URI as an external link), and
codes.

**Parcels section:** one row per `TransferredParcel`:

- a link to `/parcels/:parcelId`;
- the grantors and grantees, each a link to `/parties/:partyId` labeled with the name
  from `parties`, plus `transferredShare`.

**Improvements section:** the same layout. Improvement IDs are plain text.

**Parties section:** each `TransferParty`, with a link to `/parties/:partyId`, its name,
and its mailing address as of the transfer.

### Land use, zoning, neighborhood

**Data:**

| Page | RPC |
|---|---|
| Land use | `LandUsesService/GetLandUses` |
| Zoning | `ZoningService/GetZoning` |
| Neighborhood | `NeighborhoodService/GetNeighborhoods` |

- Each returns the whole map, which is cached for the session (`staleTime: Infinity`)
  and shared with the parcel page's labels. The route's loader prefetches it. The page
  shows the entry for its ID, or "Not found".
- Land use also shows its type: `landUseTypeId` and `landUseTypeName`, as plain text.
- Neighborhood also shows the definitions that use it (`neighborhoodDefinitionIds`),
  each as plain text labeled with its name from the definitions query. Definitions have
  no page.
- **No reverse links** in the MVP, such as "parcels with this land use". There's no RPC
  for them, and they need search or lists, which are out of scope.

### Address (`/addresses/:addressId`)

**Data:** `AddressesService/GetAddressesById` with `addressIds: [addressId]`, prefetched
by the route's loader.

**Fields:** every `Address` field, in proto order.

- `administrativeArea` and `country` show as "name (code)".
- `coordinates` shows as "latitude, longitude", as plain text. The map stays on the
  parcels page.

**Sections:** each one is a paginated list (`first: 25`, "More" via `useInfiniteQuery`
with `after`), loaded on its own like the parcel's transfers:

| Section | RPC | Each row |
|---|---|---|
| Parcels at this address | `AddressesService/GetParcelsByAddressId` | A link to `/parcels/:parcelId` |
| Improvements at this address | `AddressesService/GetImprovementsByAddressId` | The improvement ID as plain text, then a link to each of its `parcelIds` |
| Parties using this as their mailing address | `AddressesService/GetPartiesByAddressId` | A link to `/parties/:partyId`, labeled with the party's `name` |

**Not found:** an ID missing from `addresses` shows "No address with this ID".

### Party (`/parties/:partyId`)

**Data:** `PartiesService/GetPartiesById` with `partyIds: [partyId]`, prefetched by the
route's loader.

**Fields:** `name`, then the mailing address: `mailingAddress` as text, linked to
`/addresses/:mailingAddressId` when `mailingAddressId` is set.

**Sections,** paginated as on the address page:

| Section | RPC | Each row |
|---|---|---|
| Parcels | `PartiesService/GetParcelsByPartyId` | A link to `/parcels/:parcelId`, then `ownershipShare` |
| Transfers | `RealPropertyTransfersService/GetTransfersByPartyId` with `partyIds: [partyId]` | Time, amount, and a link to `/transfers/:id`, as on the parcel pane |

**Not found:** an ID missing from `parties` shows "No party with this ID".

## Styling

**Every style the app writes is StyleX.** There are no `.css` files in `src/`, no
CSS modules, no `<style>` tags, no `style` attributes in `index.html`, and no inline
`style` props.

- **Where styles live:** each component declares its styles with `stylex.create` in
  the same file, and applies them with `{...stylex.props(...)}`.
- **Shared values:** tokens shared between components (the navbar height, pane widths,
  spacing) go in one `src/theme/tokens.stylex.ts`, through `stylex.defineVars`. The
  MVP needs only a handful.
- **No global CSS.** StyleX doesn't style `html`, `body` or `#root`, so nothing else
  does either. Instead, the root route's container is `position: fixed; inset: 0`, a
  flex column with the navbar above and the page below. It fills the viewport whatever
  the browser's default `body` margin and height.
- **What's styled, all in StyleX:**

  | Element | Where | Styles |
  |---|---|---|
  | Root container | root route component | Fixed to the viewport; flex column |
  | Navbar | `components/Navbar.tsx` | One line, items at opposite ends. The "Sign out" button is reset to look like a link (no background or border, inherited font, underline, pointer), with a `:focus-visible` outline. |
  | Parcels page grid | `routes/ParcelsLayout.tsx` | Two columns (`1fr minmax(360px, 40%)`), filling the remaining height |
  | Map container | `map/ParcelMap.tsx` | Fills its grid cell. MapLibre needs a sized container. |
  | Detail pane | `routes/ParcelsLayout.tsx` | Scrolls on its own (`overflow-y: auto`) |
  | Neighborhood definition selector | `routes/NeighborhoodDefinitionSelect.tsx` | Spacing below it, separating it from the details. Browser-default form controls otherwise. |
  | Page body | root route component | Scrolls on its own below the navbar, for record pages longer than the viewport |

  Everything else, including record pages, `<dl>` fields and tables, uses browser
  defaults. A component that needs any style adds it in StyleX.
- **What can't be StyleX, and why:**

  | Exception | Why |
  |---|---|
  | `maplibre-gl/dist/maplibre-gl.css` | MapLibre builds its own DOM (canvas, controls, attribution, popups) and styles it by its own class names. StyleX can't target elements it didn't create. It's imported once, in `ParcelMap.tsx`, and no other third-party CSS is allowed. |
  | Parcel and highlight colors | They're MapLibre layer `paint` properties drawn on a WebGL canvas, not CSS, so they live in `map/style.ts` as plain constants. |
  | The basemap's look | It's set by the Positron style JSON, outside the app. |
- **Enforced by lint,** so the rule doesn't depend on review:
  - `@stylexjs/eslint-plugin` checks that every style is valid StyleX;
  - `no-restricted-imports` rejects any `*.css` import except `maplibre-gl/dist/maplibre-gl.css`;
  - `react/forbid-dom-props` and `react/forbid-component-props` reject `style` and `className`, so styling only comes from `stylex.props`.
- **Build:**
  - StyleX compiles through its official Vite integration, which at the time of
    writing is `@stylexjs/unplugin`. Confirm the current recommended package against
    the StyleX docs when building.
  - The production build emits StyleX's CSS and MapLibre's CSS as static files, so
    the CSP's `style-src 'self'` is enough.

## Errors and loading

- **While loading,** the router's pending component shows "Loading…". Nothing else is
  drawn until the route's loader has the main record.
- **A failed loader or main request** goes to the route's `errorComponent`. It shows
  `ConnectError.code` and `ConnectError.rawMessage` in a `<p role="alert">`, plus a
  "Retry" button that calls `router.invalidate()` and resets the query.
- **A failed related section** (for example transfers) shows its error in that section
  only. The rest of the page stays.
- **On the parcels page,** the map and the detail pane fail separately. A parcel that
  fails to load shows its error in the pane, and the map keeps working. A map that can't
  get bounds or tiles shows its error in the map pane, and the detail pane keeps working.
  A tile request that fails is logged by MapLibre and retried by it. Only a 401 is acted
  on (see [Auth](#auth)).
- **No error is caught and dropped,** and there's no toast. Errors stay on the page.

## Code layout

```text
src/
  main.tsx           # load config → metadata → auth → render <RouterProvider>
  router.tsx         # every route, its params/search validation and loader; Register
  config.ts          # fetch and validate config.json
  auth.ts            # UserManager, token access, the Connect interceptor
  api/
    transport.ts     # createConnectTransport with the interceptor
    queryClient.ts   # QueryClient defaults: cache policy, retry policy, Unauthenticated handler
    instance.ts      # the one plain call made before auth: GetInstanceMetadata
  links.tsx          # <RecordLink>, its type-to-route table, feature-id bigint/number helpers
  neighborhoodDefinition.ts  # selected definition: memory + localStorage store, default rule
  theme/
    tokens.stylex.ts # shared StyleX variables (navbar height, pane widths, spacing)
  map/
    ParcelMap.tsx    # MapLibre instance, layers, click → navigate, reacts to the selected ID
    style.ts         # parcel and highlight layer definitions, highlight color
    bounds.ts        # choose bounds from metadata or extent; pad for maxBounds
    selection.ts     # merge clipped feature boxes; choose the camera for a selection
  routes/
    ParcelsLayout.tsx  ParcelPane.tsx  NeighborhoodDefinitionSelect.tsx
    TransferPage.tsx  LookupPage.tsx
    AddressPage.tsx  PartyPage.tsx  Callback.tsx  NotFound.tsx
  components/
    Fields.tsx       # the <dl> renderer that follows the rendering rule
    ErrorAlert.tsx
    Navbar.tsx       # app name link, user's name, sign-out button, with its StyleX styles
```

## Testing

- **Unit tests (Vitest):**
  - `bounds.ts`: metadata bounds; missing or malformed bounds falling back to the
    extent; both missing; the 10% padding.
  - `selection.ts`:
    - merging the boxes of several tile-clipped pieces into one;
    - the camera choice: keeping a street-level zoom; zooming in from a zoomed-out
      map; zooming out for a parcel too big for the view.
  - `links.tsx`: every entity type, plus the types with no route, plus round-trips
    between feature IDs as `number` and as `bigint`.
  - Routing, against a memory-history router:
    - `/` redirects to `/parcels` and replaces the history entry;
    - moving from `/parcels/A` to `/parcels/B` and back to `/parcels` keeps the same
      layout instance, so the map isn't remounted.
  - Record routes' `params.parse`: a non-UUID ID shows "Not found" without an API
    call. This runs against a memory-history router.
  - The retry policy in `queryClient.ts`: which Connect codes retry, which don't, and
    that `Unauthenticated` starts a sign-in.
  - The tile URL builder, and `transformRequest`, which adds auth only to
    `/tiles/` URLs on the gateway.
  - `Fields.tsx` rendering of each field kind, with React Testing Library.
  - `neighborhoodDefinition.ts`:
    - the default rule: a stored choice that still exists; a stored choice that no
      longer exists falling back to the first by name; no stored choice; no
      definitions;
    - `localStorage` that throws on read and on write, so the choice still works in
      memory;
    - a `storage` event from another tab updating the choice.
  - `ParcelPane`: changing the definition requests the parcel again with the new
    `neighborhoodDefinitionId`, keeps showing the previous result meanwhile, and doesn't
    refetch transfers.
  - `Navbar.tsx`: "Sign out" calls the sign-out function; the app-name link goes to
    `/parcels`; the user's name falls back from `name` to `preferred_username` to `email`
    to `sub`.
- **Type checks as tests:** `tsc --noEmit` fails on any `Link` with a wrong path, param
  or search, and on any query whose input doesn't match its RPC. Both are checked in CI
  with no extra tests.
- **A manual smoke checklist** in `docs/mvp/smoke.md`, run against civil-os
  `mise run up` with the synthetic data and the `dev@example.com` user. It walks
  each success criterion in the intent.
- **CI:** `typecheck`, `lint` (including the StyleX ESLint plugin), `test` and `build`
  on every PR.

## Out of scope for this spec

- Packaging and deployment. The static `dist/` will be served by a small
  static-server image, the same shape as the Roll Reviewer frontend, with a Helm
  chart in the charts repo. That gets its own doc.
- Anything listed under Non-goals in the intent.

## Open questions

None. The questions raised while drafting were settled before planning.
