# Spec: improvement page

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-25 |
| **Status** | Draft. Decisions signed off by the owner in a spec brainstorm on 2026-11-25. Accepted when merged. |
| **Intent** | None. Written straight from a spec brainstorm on 2026-11-25. |
| **Depends on** | `@civil-labs/civil-os-api` **0.6.1** and civil-os **v0.7.1**, both released 2026-11-26 (UTC). 0.6.1 is the first release with `ImprovementsService.GetImprovementsById`, `GetImprovementsByPartyId` and `GetImprovementQualities`. The contract is in [civil-os `docs/improvement-read-api/spec.md`](https://github.com/civil-labs/civil-os/blob/main/docs/improvement-read-api/spec.md). |

This spec sets out the contract for showing one improvement (a building or
other structure) in Record Keeper. It covers its route, what the page shows,
the party page's new Improvements section, the lookups that name an
improvement's type, condition and quality, and how all of it is tested. The
order of the work goes in `plan.md`.

It changes one rule in [`../mvp/spec.md`](../mvp/spec.md): improvements now
have a route, so [the rendering rule](../mvp/spec.md#rendering-rule)'s
"UUID of a type with no route" row loses improvements. As the MVP spec
intended, adding the route turns every improvement ID in the app into a link
at once: on the parcel pane, the address page and the transfer page.

## Decisions

| Question | Decision |
|---|---|
| Where an improvement is shown | **On its own page, `/improvements/$improvementId`,** like the party, address and transfer pages. It isn't a pane on the parcels map: an improvement can sit on several parcels, and the API says not to assume one. |
| Values | **Not shown.** `market_value` and `assessed_value` need a `valuation_id`, and the app never sends one. Choosing a valuation is an app-wide feature that would also affect the parcel pane's value fields, so it gets its own spec. |
| Party page | **Gains an Improvements section,** from `GetImprovementsByPartyId`, between Parcels and Transfers. It's the only way to reach the improvements a party owns separately from the land. |
| Type, condition and quality | **Shown by name, not linked.** The three whole-table lookups are cached for the session, as land uses and zoning are. A name falls back to the ID while its lookup is loading, or if the lookup fails. None of the three has a page, so they stay plain text. |
| Owners | **Shown by name.** One batched `PartiesService.GetPartiesById` call for the improvement's owners. Each link shows the party's name, falling back to the ID. |
| No owners | **An explanatory note:** "No owners are recorded on this improvement. Its parcels' owners are on each parcel's page." An empty list is common, and it means ownership follows the land, not that nobody owns it. |
| Parcel pane | **"Primary condition" shows the condition's name,** from the same lookup. |
| Legal time | **Not exposed.** `legal_as_of` is never sent, so the page shows the improvement as of now, like every other read in the app. |
| Transfers | **Not on the improvement page.** civil-os has no transfers-by-improvement lookup. See [Known limits](#known-limits). |

## SDK and rollout

- **Pin:** bump `@civil-labs/civil-os-api` from `0.6.0` to exactly `0.6.1`, as
  before.
- **What it adds:** the release is additive (no `buf breaking` change), so
  nothing the app calls today changes.
- **New method descriptors,** imported from the package root:
  - `ImprovementsService.method.getImprovementsById`
  - `ImprovementsService.method.getImprovementsByPartyId`
  - `ImprovementsService.method.getImprovementTypes`
  - `ImprovementsService.method.getImprovementConditions`
  - `ImprovementsService.method.getImprovementQualities`
- **Which civil-os the app needs: v0.7.1 or later.** An older gateway answers
  the three new RPCs with `Unimplemented`. Only the improvement page and the
  party page's Improvements section fail, each with its error
  ([Errors and loading](#errors-and-loading)). Every other page keeps working.
- **Rollout:** upgrade civil-os before Record Keeper. The smoke checklists'
  setup says civil-os v0.7.1 or later.

## Routes

| Path | Page | Loader |
|---|---|---|
| `/improvements/$improvementId` | `ImprovementPage` | `ensureQueryData(improvementQuery(transport, improvementId))`, then `notFound()` if the ID isn't in `improvements`. It also starts the three lookups with `prefetchQuery`, without waiting on them or failing on them. |

- **`params.parse`** uses the existing `parseUuid`, as the other record routes
  do. A non-UUID ID shows "Not found" without an API call.
- **Not found:** "No improvement with this ID." This covers an unknown ID, a
  voided improvement, and one on no visible parcel. civil-os leaves all of
  them out of the map.
- **`links.tsx`:** `improvement` moves from `UnroutedRecordType` to the
  routed table, as `(id, children) => <Link to="/improvements/$improvementId"
  params={{ improvementId: id }}>`. `improvementType` and
  `improvementCondition` stay unrouted. A new unrouted type,
  `improvementQuality`, is added.

## Improvement page (`/improvements/:improvementId`)

**Data:** `ImprovementsService/GetImprovementsById` with
`improvementIds: [improvementId]`, prefetched by the route's loader. There's no
`valuationId` and no `legalAsOf`.

**Heading:** "Improvement: {label}", where the label is:
- "{type name} at {formatted address}" when both are known;
- the type name or the formatted address alone, when only one is;
- the improvement ID otherwise.

The type name counts as known only once the types lookup has it.

**Fields,** in proto order. The rendering rule applies: numbers as returned,
`—` for unset.

| Label | Kind | From |
|---|---|---|
| Improvement ID | text | `improvementId` |
| Type | record `improvementType` | `typeId`, labelled from the types lookup |
| Condition | record `improvementCondition` | `conditionId`, labelled from the conditions lookup |
| Quality | record `improvementQuality` | `qualityId`, labelled from the qualities lookup |
| Address | record `address` | `addressId`, with `formattedAddress` as its text. Both are unset when the address isn't visible, which shows `—`. |
| Area (sq ft) | text | `areaSqFt` |
| Full bathrooms | text | `fullBathrooms` |
| Half bathrooms | text | `halfBathrooms` |
| Bathrooms | text | `bathrooms` |
| Bedrooms | text | `bedrooms` |
| Units | text | `units` |
| Year built | text | `yearBuilt` |
| Effective year built | text | `effectiveYearBuilt` |
| Properties | json | `properties` |

- **Unset is not zero.** Every count on `Improvement` is `optional`, and an
  unset one means "not recorded". The page shows `—` for it, never `0`.
  `formatBathrooms`, the parcel pane's helper, is not used here: it treats 0 as
  "not recorded", which suits the summary's non-optional totals, not these
  fields. A recorded 0 shows as `0`.
- **Not shown:** `marketValue` and `assessedValue` (see
  [Decisions](#decisions)). `parcels` and `parties` are the sections below.

**Sections.** Neither one is paginated: both lists come whole with the
improvement.

| Section | Rows | Each row |
|---|---|---|
| Parcels | `parcels`, in the order returned (by parcel ID) | A link to `/parcels/:parcelId`, then "Primary": "Yes" or "No", from `isPrimary` |
| Owners | `parties`, in the order returned (by party ID) | A link to `/parties/:partyId`, labelled with the party's `name`, then `ownershipShare` as returned |

- **Parcels is always a list.** The page never picks one parcel as "the"
  parcel, and never reads `parcels[0]`. The "Primary" column says whether this
  improvement is the primary improvement *of that parcel*. It doesn't mark a
  main parcel for the improvement. The column header is "Primary on parcel".
  `parcels` is never empty: civil-os hides an improvement with no visible
  parcel.
- **Owner names** come from one `GetPartiesById` call with every `partyId`
  in `parties`, through `partiesByIdQuery`. The call goes through the cache, so
  owners already seen elsewhere aren't fetched again. The rows render at
  once, labelled with IDs, and take names as the call returns.
  - If the call fails, the rows keep their IDs, and the section shows the
    error above the table in an `ErrorAlert`.
  - A party missing from the response (hidden since the improvement was read)
    keeps its ID as the label.
- **No owners:** when `parties` is empty, the section shows the note from
  [Decisions](#decisions) in place of the table. It makes no
  `GetPartiesById` call.

## Party page: Improvements section

Between Parcels and Transfers, paginated as the Parcels section is
(`first: 25`, "More" via `useInfiniteQuery` with `after`), and loaded on its
own.

| Section | RPC | Each row |
|---|---|---|
| Improvements | `ImprovementsService/GetImprovementsByPartyId` with `partyId` | A link to `/improvements/:improvementId`, labelled with the ID, then `ownershipShare` |

- The hook is `useImprovementsByParty(partyId)`, in `src/api/parties.ts`,
  next to `useParcelsByParty`. Its rows function is `improvementsByPartyRows`,
  which returns `page.improvements`.
- **The section lists only improvements recorded under the party itself.**
  Buildings on parcels the party owns are on those parcels' pages. An empty
  section shows `PagedList`'s usual empty state.

## Lookups

In `src/api/lookups.ts`, next to the others, each with `lookupQueryOptions`
so it's fetched once per session:

| Query | RPC | Map |
|---|---|---|
| `improvementTypesQuery` | `getImprovementTypes` | `improvementTypes`, by ID |
| `improvementConditionsQuery` | `getImprovementConditions` | `improvementConditions`, by ID |
| `improvementQualitiesQuery` | `getImprovementQualities` | `improvementQualities`, by ID |

Pages read them with `useQuery` and build labels with the parcel pane's
existing `labels(map)` helper, which moves to a shared module. The
improvement page and the parcel pane use that one helper.

**Parcel pane:** the parcel route's loader also starts
`improvementConditionsQuery` with `prefetchQuery`, and "Primary condition"
takes `text: names.conditions[primaryConditionId]`. The pane's other
improvement fields stay as they are, except that "Improvements" and "Primary
improvement" are now links, through `RecordLink`.

## Errors and loading

The MVP's rules apply, plus:
- **A failed improvement read** goes to the route's `errorComponent`, as for
  any record page. That includes `Unimplemented` from a civil-os older than
  v0.7.1.
- **A failed lookup** never fails the page. Its field shows the ID.
- **A failed owner-names call** shows its error in the Owners section only.
- **A failed party Improvements section** shows its error in that section
  only. The party's fields, Parcels and Transfers stay.

## Code layout

| File | Change |
|---|---|
| `src/api/improvements.ts` | New: `improvementQuery(transport, improvementId)` |
| `src/api/parties.ts` | `useImprovementsByParty`, `improvementsByPartyRows`; `partiesByIdQuery(transport, partyIds)` for the batched owner names |
| `src/api/lookups.ts` | The three improvement lookup queries |
| `src/routes/ImprovementPage.tsx` | New: the page and its two sections |
| `src/routes/PartyPage.tsx` | `ImprovementsSection` |
| `src/routes/ParcelPane.tsx` | Condition label; the `labels` helper moves out |
| `src/router.tsx` | `improvementRoute`; the parcel route's loader prefetches conditions |
| `src/links.tsx` | `improvement` routed; `improvementQuality` added as unrouted |
| `src/test/fixtures.ts` | The fake civil-os serves the five improvement RPCs |
| `docs/mvp/spec.md` | The rendering rule's no-route row, the Party section's table, and the code layout, each noting this spec changed it |
| `docs/mvp/smoke.md` | "Improvement IDs are plain text" becomes "Improvement IDs open their improvement pages"; setup says civil-os v0.7.1 or later |
| `docs/improvement-page/smoke.md` | New: the checklist under [Testing](#testing) |

## Testing

**Fixtures:** `fakeCivilOs` gains synthetic improvements in the shape of the
civil-os fixtures. Synthetic data only, as today.

| Improvement | Shape | Covers |
|---|---|---|
| `IDS.improvement` (2) | Type, condition, quality and address set, every count set, two owners at `0.5000`, one primary parcel link | the full page, owner names |
| A second improvement | Two parcel links, one primary and one not; no owners; no address; every count unset except `fullBathrooms: 0` | lists of parcels, the no-owners note, `—` for unset, `0` for a recorded zero |

The fake also serves the three lookups (one entry each, plus an ID in a
fixture that no lookup knows), and `GetImprovementsByPartyId` with enough
rows to make two pages.

**Page tests (Vitest and React Testing Library):**
- `ImprovementPage`:
  - **Fields:** every field in proto order; type, condition and quality by
    name; the address linked with its formatted text; a heading of "{type} at
    {address}".
  - **Lookups:** a lookup that fails, or doesn't know an ID, shows the ID,
    and the page still renders.
  - **Unset and zero:** for the second improvement, `—` for each unset count
    and `0` for the recorded zero; a heading of the type alone; Address `—`.
  - **Parcels:** both links, with "Yes" and "No" in "Primary on parcel", in
    the order returned.
  - **Owners:** both linked with names after one `GetPartiesById` call for
    both IDs. A failed call keeps the ID labels and shows the error in the
    section only. No owners shows the note and makes no call.
- `PartyPage`: the Improvements section lists links and shares, and "More"
  loads the second page with `after`. A failed section shows its error
  without hiding Parcels or Transfers.
- `ParcelPane`: "Primary condition" shows the condition's name, and shows the
  ID when the lookup fails.
- **Router:**
  - `/improvements/not-a-uuid` shows "Not found" with no API call;
  - an ID that civil-os leaves out shows "No improvement with this ID.";
  - hovering an improvement link preloads it.
- `links.test.tsx`: `improvement` links to its page; `improvementType`,
  `improvementCondition` and `improvementQuality` render plain text.
- **Existing tests** that assert improvement IDs are plain text (the transfer
  and address pages) are updated to expect links. That's the intended change,
  not a regression.

**Type checks** catch a wrong route path or params, and a query input that
doesn't match its RPC, as before.

**Smoke checklist** (`docs/improvement-page/smoke.md`), run against civil-os
v0.7.1 or later with `mise run up` and the `dev@example.com` user. Short IDs
are the last digits of the civil-os fixture UUIDs.
- **Parcel 2's pane:**
  - "Primary condition" reads "Average";
  - improvement 2 in "Improvements" opens its page.
- **Improvement 2:**
  - the heading is "Improvement: Single family dwelling at 2 Fixture Way,
    Testville ZZ000";
  - Condition "Average", Quality "Fixture Standard";
  - the address opens address 2;
  - Parcels lists parcel 2, "Primary on parcel: Yes";
  - Owners lists "Fixture Owner 2" and "Fixture Owner 3" at `0.5000`, each
    opening its party page.
- **Parcel 3's pane:** improvement 16 opens a page with "Primary on parcel:
  No" and one owner, "Fixture Owner 5". That's not parcel 3's owner. Its
  "Full bathrooms" and "Bedrooms" are recorded zeros and show `0`, while
  "Half bathrooms" is unset and shows `—`.
- **Improvement 1:** no owners shows the note.
- **Improvement 18:** "Condition", "Quality" and the counts show `—`, and its
  parcel is parcel 12.
- **Party 3:** the Improvements section lists improvements 2 (`0.5000`) and 3
  (`1.0000`), and each opens its page.
- **Party 2:** improvement 2 only.
- **Transfer 3 and address 2:** their improvement IDs are now links.
- **Unknown IDs:** `/improvements/53000000-0000-4000-8000-000000000017`
  (on a voided parcel) and an unknown UUID both show "No improvement with
  this ID."
- **Back:** retraces parcel 2 → improvement 2 → party 3 → improvement 3.

**CI:** `typecheck`, `lint`, `test` and `build`, as today.

## Known limits

- **No transfers on the improvement page.** civil-os has
  `GetTransfersByParcelId`, `ByFeatureId` and `ByPartyId`, but nothing by
  improvement. Transfers that convey an improvement are still reachable
  through its parcels and owners. Adding the lookup is a civil-os intent.
- **No values,** until the app can choose a valuation.
- **Current record only.** The improvement's history (civil-os answers
  `legal_as_of`) isn't shown.
- **Condition and quality names are as of now,** as civil-os's lookups are.
  That's the same as how the app reads everything.

## Out of scope for this spec

- Choosing a valuation, app-wide.
- Pages for improvement types, conditions and qualities.
- Improvement geometry or footprints on the map. civil-os's improvement read
  API has none, and whether footprints are public is for civil-os
  `docs/tile-source-allowlist/intent.md` to settle.
- Editing improvements.
