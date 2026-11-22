# Spec: civil-os 0.6 and public API 0.5

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-22 |
| **Status** | Draft. Accepted when merged. |
| **Intent** | None. An upgrade to keep up with civil-os, with no change in behavior. |
| **Depends on** | civil-os **v0.6.0** and public-api **v0.5.0**, both released 2026-11-22 ([public-api changelog](https://github.com/civil-labs/civil-os/blob/main/api/proto/public/CHANGELOG.md#050-2026-11-22)). `@civil-labs/civil-os-api@0.5.0` is on npm, and its typings match this spec: `NeighborhoodsService`, the four moved RPCs on their new services, and no `edges`. |
| **Builds on** | Address search, merged to `main` on 0.4.1. Its `SearchParcelsAddresses` call and fixtures are in scope here: they don't change, and the smoke run checks they still work against v0.6.0. |

This spec moves the app from `@civil-labs/civil-os-api` 0.4.1 to 0.5.0 and sets
out what has to change because of it. Users see no difference: the same pages
make the same calls and show the same rows. The order of the work goes in
`plan.md`.

## What changed upstream

public-api 0.5.0 makes three breaking changes. civil-os v0.6.0 is the server
release that serves them.

| Change | Before (0.4.1) | After (0.5.0) |
|---|---|---|
| Services take plural names | `NeighborhoodService`, `ValuationService` | `NeighborhoodsService`, `ValuationsService`. Same RPCs and messages. |
| Reverse lookups move to the service of what they return | `AddressesService.GetParcelsByAddressId`, `AddressesService.GetImprovementsByAddressId`, `AddressesService.GetPartiesByAddressId`, `PartiesService.GetParcelsByPartyId` | `ParcelsService.GetParcelsByAddressId`, `ImprovementsService.GetImprovementsByAddressId`, `PartiesService.GetPartiesByAddressId`, `ParcelsService.GetParcelsByPartyId`. Request and result fields don't change. |
| Paged responses drop edges | `edges: [{ cursor, node }]` | One repeated field named for what it holds: `transfers`, `parcels`, `improvements` or `parties`. Paging still uses `page_info.end_cursor`. Per-row cursors are gone. |

`SearchParcelsAddresses` already returned `hits` without edges, so search
doesn't change.

## Decisions

| Question | Decision |
|---|---|
| Version pin | **Exactly `0.5.0`,** as before. |
| Behavior | **None changes.** Same calls with the same arguments, the same rows, page sizes, "More" button and errors. Any visible difference is a bug. |
| Which civil-os the app needs | **v0.6.0 or later.** An older gateway answers the renamed services and moved RPCs with `Unimplemented`. A v0.6.0 gateway gives an older Record Keeper the same error. The app and civil-os must be upgraded together: see [Rollout](#rollout). |
| How `PagedList` finds the rows | **The caller says which field holds them.** See [Paged lists](#paged-lists). |
| Docs | **Update the MVP spec's tables to the new service names** and note that this spec changed them, as address search did. The smoke checklists say civil-os v0.6.0 or later. |

## Service renames and moved RPCs

| File | Today | After |
|---|---|---|
| `src/api/lookups.ts` | `NeighborhoodService.method.getNeighborhoods`, `.getNeighborhoodDefinitions` | `NeighborhoodsService.method.…` |
| `src/api/addresses.ts` | `AddressesService.method.getParcelsByAddressId` | `ParcelsService.method.getParcelsByAddressId` |
| `src/api/addresses.ts` | `AddressesService.method.getImprovementsByAddressId` | `ImprovementsService.method.getImprovementsByAddressId` |
| `src/api/addresses.ts` | `AddressesService.method.getPartiesByAddressId` | `PartiesService.method.getPartiesByAddressId` |
| `src/api/parties.ts` | `PartiesService.method.getParcelsByPartyId` | `ParcelsService.method.getParcelsByPartyId` |

The hooks keep their names and stay in the files they're in today
(`useParcelsByAddress` stays in `addresses.ts`, and so on). They're grouped by
the page that uses them, not by service. Everything is still imported from the
package root.

The app doesn't call `ValuationService`, so that rename needs no change.

The query keys change because Connect-Query builds them from the service's full
name. Nothing stores query keys, so that's harmless.

## Paged lists

`PagedList.tsx` reads every page as `page.edges[].node`. In 0.5.0 each response
holds its rows in a field with its own name, so `Page<T>` can't name the field.

```ts
// components/PagedList.tsx
export interface Page {
  pageInfo?: { hasNextPage: boolean; endCursor?: string }
}

export function PagedList<P extends Page, T>(props: {
  query: UseInfiniteQueryResult<InfiniteData<P>, ConnectError>
  /** The rows on one page, such as `(page) => page.transfers`. */
  rows: (page: P) => T[]
  children: (rows: T[]) => ReactNode
}): ReactNode
```

- `nextCursor` and `pagedOptions` stay as they are: they only read `pageInfo`.
- The rows come from `query.data.pages.flatMap(rows)`. The 0.5.0 fields hold
  messages, not optional nodes, so the filter for missing nodes goes.
- Each caller passes its field:

| Caller | `rows` |
|---|---|
| `TransfersList.tsx` | `(page) => page.transfers` |
| `AddressPage.tsx`, parcels | `(page) => page.parcels` |
| `AddressPage.tsx`, improvements | `(page) => page.improvements` |
| `AddressPage.tsx`, parties | `(page) => page.parties` |
| `PartyPage.tsx`, parcels | `(page) => page.parcels` |

A typo in the field name is a type error, so a wrong field can't reach a user.

## Tests

- `src/test/fixtures.ts` registers the moved RPCs on their new services, renames
  `NeighborhoodService`, and returns rows in the new fields with no edges or
  per-row cursors. `record()` names don't change, so tests that look up calls
  by method name (such as `PartyPage.test.tsx`) still pass unchanged.
- `LookupPage.test.tsx` uses `NeighborhoodsService`.
- The paging test still loads a second page with "More" and checks it sends
  the first page's `endCursor` as `after`.
- Typecheck, lint and the whole test suite pass. No test's expected output
  changes. If one does, behavior changed.

## Smoke

Run the MVP and address-search smoke checklists against a civil-os **v0.6.0**
local stack. Pay attention to every list with a "More" button (an address with
more than 25 parcels, a party's transfers) and the lookup page's
neighborhoods. Both checklists change "civil-os at #69 or later" to "civil-os
v0.6.0 or later".

## Rollout

The renames break every mix of old and new: a Record Keeper on 0.4.1 against a
v0.6.0 gateway fails, and so does one on 0.5.0 against v0.5.1.

- Prod `fl-lee` runs Record Keeper **`v0.1.1`** against civil-os **`v0.5.1`**
  (gitops `environments/prod/fl-lee/values.yaml`, since gitops #8). Upgrading
  either one alone breaks prod Record Keeper. The renamed and moved calls
  (neighborhoods, and the lists on the address and party pages) fail with
  `Unimplemented`. Transfer lists keep their service, but a 0.4.1 client
  reading a 0.5.0 response finds no `edges`: it either fails to parse or shows
  "None." The worse case is the quiet one, a list that wrongly shows
  "None."
- **One gitops PR changes both** `civil_os.version` to `v0.6.0` and
  `opencama_record_keeper.version` to `v0.2.0`. Neither version is bumped in
  a PR of its own. civil-os also needs its gateway, database reader and
  database writer upgraded together (its changelog says so). Its chart does
  that in one sync.
- Even with one PR, the two apps sync separately, so there's a short window
  where they don't match. Nobody depends on prod Record Keeper yet (confirmed
  2026-11-22), so the spec accepts that window rather than adding version
  negotiation or a maintenance note. A browser that
  loaded the old app before the sync keeps failing until it reloads.
- Before that PR, run the smoke checklists against the v0.6.0 local stack
  ([Smoke](#smoke)). After it syncs, open `https://records-leepa.civillabs.app`,
  then load an address page, a party page and the lookup page.
- The PR that bumps the SDK has a `!` in its title (`feat!: …`). The repo
  squash-merges with a blank body, so the title is the only part of the
  commit that reaches `main`. Under `bump-minor-pre-major`, release-please
  makes that 0.1.1 → **0.2.0**. The PR description says the app needs
  civil-os v0.6.0.

## Non-goals

- Using anything new in 0.5.0. It adds no RPCs, only reorganizes them.
- Supporting civil-os older and newer at once. There's one supported version.
- Moving hooks between `src/api/` files to match the new services.
