# Intent: Record Keeper MVP, a read-only browser for Civil OS records

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-15 |
| **Status** | Draft. Accepted when merged. |
| **Repo** | `opencama-record-keeper` |

## Problem

Record Keeper is the OpenCAMA app for viewing and editing the data in a Civil OS
instance. Today the only way to look at that data is to send API requests by hand
(the Bruno collection) or query the database. A person can't:

- find a parcel by pointing at it on a map;
- see a parcel's address, owners, land use, zoning, neighborhood and transfers in
  one place;
- follow those references to other records, such as from an owner to the
  owner's other parcels, or from a transfer to its grantors.

## Proposed outcome

A minimal, read-only Record Keeper that does one job: **show a record, and let
you follow every reference it holds to another record.**

1. **A parcels page with a map and a detail pane.** It's the app's home page: the
   base URL redirects to it.
   - The map is on the left. Parcels from the Civil OS parcel tiles
     (`get_parcel_tiles`) are drawn over a basemap, and the map is limited to the
     instance's bounds, as Civil OS reports them.
   - The selected parcel's details are in a pane on the right.
   - Clicking a parcel selects it: its ID goes into the URL, its details fill the
     pane, and it's centered and highlighted on the map.
   - With nothing selected, the map shows the whole instance and the pane is empty.
2. **One plain page for each other record type:**
   - address;
   - party;
   - real property transfer (RPT);
   - land use, zoning and neighborhood.
3. **Every reference is a link.** If a field holds the ID of another record that
   has a page, it links to that page. Each hop is one click, and browser Back
   returns you to where you were.
4. **Every page has a URL that can be shared.** Opening the URL directly, signed
   in, shows the same record.

The MVP is the foundation for the full read/write app. Its stack, routing, data
fetching and auth are chosen to carry editing later. It deliberately has no
styling beyond a simple navbar, the parcels page's two-pane layout and the
map's colors.

## Design principle

Following [danieldelaney.net/normal](https://danieldelaney.net/normal/):

- Build the common path, which is to look up a record and follow its links.
- Give each page one obvious job.
- Leave everything else out until it's needed. The API and the database remain
  the tools for edge cases.

## Constraints

- **Read-only.** No mutations, even though `ParcelsService.UpdateParcel` exists.
- **Civil OS public API only.** The app uses the ConnectRPC services and the
  `/tiles/` endpoint behind the gateway, through the published
  `@civil-labs/civil-os-api` SDK. It doesn't read the database directly.
- **No backend.** The app is static files. The user signs in from the browser to
  the instance's identity provider.
- **Addresses and parties depend on Civil OS.** Civil OS has no read RPCs for
  them yet. They're being added through civil-os
  `docs/address-party-read-api/intent.md`. Until those RPCs ship, the MVP ships
  with its address and party pages showing only what other records already carry.
- **Neighborhoods are read under a chosen definition.** A parcel's neighborhood
  depends on the neighborhood definition. The parcels page has a dropdown of
  definitions, and the choice is remembered across pages and visits. Under some
  definitions Civil OS returns no neighborhood even when one is assigned. That's
  fixed in civil-os `docs/neighborhoods-api-fixes/intent.md`.
- **Parcel location depends on Civil OS too.** The public API returns no
  geometry or extent for a parcel, so the map can only center on parcels in
  tiles it has already loaded. A parcel-extent read
  (`GetParcelExtentsWGS84ByParcelId`) is proposed in the same civil-os intent as
  the address and party reads.
- **The basemap is OpenFreeMap Positron,** a free third-party service. It never
  receives the Civil OS token or any parcel data.
- **Synthetic data in development.** The app is built and tested against the
  Civil OS local stack (`mise run up`). Docs and tests contain no customer or
  jurisdiction data.

## Non-goals

- Editing, of any kind.
- Visual design or styling, beyond the navbar, the two-pane layout, the parcel
  line and highlight colors, and the basemap's own style.
- Search and lists, including parcel search by address or owner.
- Choosing a valuation, and showing values that depend on one.
- History or as-of views.

## Success criteria

Against the Civil OS local stack running synthetic data:

- Opening the app lands on the parcels page, showing the whole instance.
- Clicking a parcel puts its ID in the URL, shows its details in the pane, and
  centers and highlights it on the map. Opening that URL directly shows the same
  details and highlight. Centering on a parcel opened directly needs a Civil OS
  parcel-extent read. Until that exists, the user may have to zoom in to find it.
- From the selected parcel, a user can reach its
  address, each party, its land use, each zoning, its neighborhood under the
  selected definition, and each transfer, one click per hop. From a transfer, they can reach each parcel and
  each party.
- Changing the neighborhood definition updates the selected parcel's
  neighborhood without leaving the page. The choice is still selected after
  visiting other pages, reloading, or opening the app in a new tab.
- Browser Back retraces every hop.
- Reloading any page, or opening its URL in a new tab, shows the same record
  after sign-in.
- A failed request shows its error on the page. Nothing fails silently.
- Once the Civil OS address and party RPCs ship, a party page links to that
  party's parcels and mailing address, and an address page links to the records
  that use it. Once the neighborhoods fix ships, parcels have their neighborhood
  under every definition. No other change is needed.
