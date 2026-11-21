# Spec: address search

| | |
|---|---|
| **Author / product owner** | Jackson |
| **Date** | 2026-11-20 |
| **Status** | Draft. Accepted when merged. |
| **Intent** | None. Written straight from a spec brainstorm on 2026-11-20. The MVP intent listed "parcel search by address or owner" as a non-goal for the MVP; this spec takes the address half. |
| **Depends on** | `@civil-labs/civil-os-api` **0.4.1**, the first release with `ParcelsService.SearchParcelsAddresses` (civil-os #69, contract in [civil-os `docs/parcel-search/spec.md`](https://github.com/civil-labs/civil-os/blob/main/docs/parcel-search/spec.md)). |

This spec sets out the contract for searching parcels by address from the
navbar: where the box goes, when it calls the API, what the dropdown shows,
how recent picks are kept, and how it's tested. The order of the work goes in
`plan.md`.

It changes two rules in [`../mvp/spec.md`](../mvp/spec.md): the navbar now
holds a search box ([Navbar](../mvp/spec.md#navbar) said "no search"), and the
app now stores a second per-user value in `localStorage`. The MVP's "no search
params" rule stands: the query isn't in the URL.

## Decisions

| Question | Decision |
|---|---|
| Where search lives | **In the navbar, on every page.** One box, between the app name and the user's name. Picking a hit works the same from any page. |
| How it searches | **A typeahead.** It calls the API 250 ms after the last keystroke, once the query has at least 3 letters or digits. There's no submit step and no results page. |
| How many hits | **The first 10, with no paging.** One call with `first: 10`. When `page_info.has_next_page` is true, the dropdown's footer says "More matches. Keep typing to narrow down." The RPC ranks best first, so the top 10 are the ones that matter. Paging inside a dropdown would mean loading up to the RPC's 1,000-hit cap for no gain. |
| What a pick does | **Goes to the parcel:** `navigate({ to: "/parcels/$parcelId", params: { parcelId } })`, which pushes a history entry. The existing route loader and [Selection](../mvp/spec.md#selection) code load the parcel and move the map to it, exactly as for a pasted URL. The hit's `feature_id` isn't used: one code path, not two. |
| URL state | **None.** The query and the open/closed state live in component state. The parcel URL a pick leads to is the shareable part. |
| Highlighting | **None.** Each hit shows `formatted_address` as plain text. Matching ignores punctuation and allows typos, so a client-side highlight would often be wrong or missing. |
| Searching at a past date | **Not exposed.** `legal_as_of` is never sent, so search runs as of now, like every other read in the app. |
| Recent picks | **The last 5 hits picked, per user,** shown when the box is focused and empty. They're cleared on sign-out. See [Recent picks](#recent-picks). |
| While a search is running | **The previous hits stay, dimmed, with a "Searching…" line.** A newer search supersedes an older one, and an older response is never shown over a newer one. Broad queries can take about 1.4 s (the RPC ships over its latency target), so clearing the list on every keystroke would make it flicker. |

## SDK

- Bump `@civil-labs/civil-os-api` from `0.4.0` to `0.4.1` (exact pin, as today).
- The method descriptor is `ParcelsService.method.searchParcelsAddresses`,
  imported from the package root like the others
  ([Connect-Query and the SDK](../mvp/spec.md#connect-query-and-the-sdk)).
- `idempotency_level = NO_SIDE_EFFECTS` lets the transport use Connect GET.
  The app's transport doesn't turn on `useHttpGet` today, and this spec
  doesn't change that.
- No CSP change: the call goes to the gateway, which `connect-src` already
  allows.

## The query

### Normalising and the minimum length

The client mirrors the server's normalisation only to decide **whether to
call**. It always sends the text **as typed**, and the server normalises it
again.

```ts
// search/query.ts
export function normalizeQuery(raw: string): string
// raw.toLowerCase(), every run of characters that aren't letters or digits
// (/[^\p{L}\p{N}]+/gu) → one space, then trim.

export function isSearchable(raw: string): boolean
// normalizeQuery(raw) has at least 3 letters or digits, and raw.length ≤ 200.
```

- `\p{L}\p{N}` stands in for PostgreSQL's `[:alnum:]`. They may disagree on
  rare scripts. If the server still rejects a query, the dropdown shows the
  error (see [Errors](#errors)), so a mismatch shows up and doesn't fail silently.
- The input has `maxLength={200}`, the RPC's raw limit.
- Below the minimum, no call is made. A non-empty box shows the hint "Type at
  least 3 letters or numbers." An empty box shows recent picks, or nothing.

### Calling

```ts
// api/search.ts
useQuery(
  ParcelsService.method.searchParcelsAddresses,
  debouncedSearchable ? { query: debounced, first: 10 } : skipToken,
  { placeholderData: keepPreviousData, staleTime: 30_000 },
)
```

- **Debounce:** 250 ms after the last change to the input. The debounced value
  is what goes into the query key. `useDebouncedValue` lives in
  `search/useDebouncedValue.ts` and has its own test.
- **`skipToken`** when the debounced text isn't searchable, so there's no call
  and no cache entry.
- **`keepPreviousData`** keeps the last hits on screen while the next query
  loads. `isPlaceholderData` drives the dimmed style and the "Searching…" line.
- **Ordering:** each debounced query has its own key, so a slow response for
  an old key is never rendered as the current one. TanStack Query passes an
  `AbortSignal`, and Connect-Query hands it to the transport, so a superseded
  request is cancelled once nothing is subscribed to it.
- **Cache:** `staleTime` 30 s, like other records. Typing the same text again
  within that window is served from the cache. `refetchOnWindowFocus` is off
  for search, so coming back to the tab doesn't reorder an open dropdown.
- **Retries:** the shared policy in `queryClient.ts`, unchanged.
  `InvalidArgument` isn't retried.

## The search box

`components/AddressSearch.tsx`, rendered by `Navbar` between the app name and
the user block. Its styles are next to it, in StyleX.

### Markup and keyboard

It follows the [ARIA 1.2 combobox pattern](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/)
with a listbox popup:

- an `<input type="search" role="combobox" aria-autocomplete="list"
  aria-expanded aria-controls aria-activedescendant>`, labelled "Search
  addresses" by a visually hidden `<label>`, with the placeholder "Search
  addresses";
- a `<ul role="listbox">` of `<li role="option" id aria-selected>`, one per
  hit or recent pick;
- a polite live region (`role="status"`) for the status line.

| Key | Effect |
|---|---|
| Typing | Updates the query and opens the popup. |
| ↓ / ↑ | Moves the active option, wrapping. Opens the popup if it's closed. |
| Enter | Picks the active option. With none active, does nothing. |
| Escape | Closes the popup. Pressed again with it closed, clears the input. |
| Tab | Closes the popup and moves focus on as usual. |

- A mouse click on an option picks it. `mousedown` calls `preventDefault`, so
  the input keeps focus until the pick.
- Clicking outside or blurring the input closes the popup.
- **After a pick:** the input is cleared, the popup closes, the input loses
  focus, and the app navigates to the parcel.
- The popup opens on focus when there's something to show (recent picks, a
  hint or hits).

### What the popup shows

| State | Shown |
|---|---|
| Empty input, recent picks stored | A "Recent" heading, then up to 5 picks, newest first |
| Empty input, nothing stored | Nothing (popup stays closed) |
| Fewer than 3 letters or digits | The hint "Type at least 3 letters or numbers." |
| First search for this text, loading | "Searching…" |
| Hits | Up to 10 options, in the order returned. Each one's text is `formatted_address`. |
| Hits, `has_next_page` true | Hits, then the footer "More matches. Keep typing to narrow down." |
| Loading the next text, with earlier hits | The earlier hits, dimmed, and "Searching…" |
| No hits | "No parcels match." |
| Error | See [Errors](#errors) |

- Several parcels can share an address. They appear next to each other with
  the same text, which is correct: they're different parcels. No parcel ID is
  shown.
- The live region announces the count ("10 results, more available", "3
  results", "No parcels match") or "Searching…".

### Errors

- A failed search shows one line in the popup:
  `Search failed: {ConnectError.code}. {ConnectError.rawMessage}`, in a
  `<p role="alert">`, with no retry button. Typing again retries.
- It never reaches a route's `errorComponent`, and the rest of the page is
  unaffected.
- `Unauthenticated` starts a sign-in through the shared `QueryCache` handler,
  as for every other query.

## Recent picks

`search/recentPicks.ts`, shaped like `neighborhoodDefinition.ts`: a small
store with an in-memory copy, backed by `localStorage` when the browser allows
it, and followed across tabs through the `storage` event.

- **Value:** a JSON array of up to 5 `{ parcelId: string, formattedAddress:
  string }`, newest first. Picking a hit moves it to the front, removes any
  older entry with the same `parcelId`, and drops the sixth.
- **Key:** `recordKeeper.recentPicks.{sub}`, where `sub` is the signed-in
  user's ID-token `sub`. Users sharing a workstation don't see each other's
  picks.
- **Picking a recent entry** navigates to `/parcels/{parcelId}` directly, with
  no search, and moves it to the front.
- **Stale entries** are shown as stored. A parcel voided since then lands on
  the parcel route's existing "Not found", and the entry stays until it's
  pushed out. An address that changed since shows its old text until the
  parcel is picked again from a search.
- **Storage that throws** on read or write (blocked site data, private
  windows, a full quota) leaves the store working in memory for the tab.
  Search never depends on it.
- **Malformed stored data** (not JSON, wrong shape) is treated as empty and
  overwritten on the next pick.

### Clearing on sign-out

`Auth.signOut()` removes the signed-in user's `recordKeeper.recentPicks.{sub}`
key before it clears the session. `Auth` doesn't import the search code: the
store registers a sign-out hook, or `signOut` takes a list of keys to remove.
The plan picks one. Other tabs see the key removed through the `storage`
event and empty their in-memory copy.

- **Only an explicit sign-out clears them.** `clearAndSignIn` after an expired
  or rejected token keeps them, since the same user signs back in.
- **Signing in as someone else** shows that user's own key, so it isn't a leak.

## Code layout

New and changed files, against [`../mvp/spec.md#code-layout`](../mvp/spec.md#code-layout):

```text
src/
  api/
    search.ts               # useAddressSearch: the query, debounce input, placeholder data
  search/
    query.ts                # normalizeQuery, isSearchable
    useDebouncedValue.ts
    recentPicks.ts          # per-user store, localStorage + memory, storage event
  components/
    AddressSearch.tsx       # combobox, popup states, keyboard, pick → navigate
    Navbar.tsx              # (changed) renders <AddressSearch>
  auth.ts                   # (changed) sign-out clears recent picks
  test/fixtures.ts          # (changed) search hits
```

## Testing

- **Unit tests (Vitest):**
  - `query.ts`: case and punctuation folding; runs of separators becoming one
    space; trimming; the 3-character boundary (`"12"` no, `"1-2-3"` yes,
    `"  ab "` no); accented letters counting as letters; the 200-character
    limit.
  - `useDebouncedValue.ts`, with fake timers: one value after a burst of
    changes, emitted 250 ms after the last.
  - `recentPicks.ts`:
    - pushing to the front, de-duplicating by `parcelId`, the cap of 5;
    - keys scoped by `sub`: two users don't see each other's entries;
    - `localStorage` that throws on read and on write;
    - malformed stored JSON read as empty;
    - a `storage` event from another tab, including the key's removal.
- **Component tests (React Testing Library, `createRouterTransport`):**
  - no call below 3 letters or digits, and the hint shown;
  - one call per debounced burst, with `{ query, first: 10 }` and no
    `legalAsOf`;
  - hits rendered in order; the "More matches" footer only when
    `hasNextPage`; "No parcels match." on an empty page;
  - while the next query loads, the previous hits stay, dimmed, and
    "Searching…" shows; a slow first response arriving after a fast second one
    isn't shown;
  - ↓/↑ wrap, Enter picks, Escape closes then clears; `aria-activedescendant`
    and `aria-expanded` follow;
  - a pick navigates to `/parcels/{parcelId}` (memory-history router), clears
    the input and records the pick;
  - focusing an empty box lists recent picks, and picking one navigates with no
    RPC call;
  - a failed search shows the alert line in the popup and leaves the page
    alone;
  - `Navbar`: sign-out removes the user's recent-picks key; `clearAndSignIn`
    doesn't.
- **Type checks as tests:** the mocked RPC handler in tests is typed by the SDK
  descriptor, so a renamed field in a later SDK fails `tsc --noEmit`.
- **Manual smoke** against civil-os `mise run up` with the synthetic data,
  added to `docs/address-search/smoke.md`: search for a fixture address, pick
  it, check the map moves to it; a typo (`fxture way`) still finds it; a broad
  query shows the footer; recent picks survive a reload and disappear after
  sign-out.
- **CI:** unchanged (`typecheck`, `lint`, `test`, `build`).

## Out of scope

- Owner-name and parcel-number search. The RPC doesn't offer either (civil-os
  `parcel-search` spec, and its `parcel-number-search` intent).
- A results page, paging past the first 10, and the query in the URL.
- Searching as of a past date.
- Highlighting the matched text.
- A keyboard shortcut to focus the box.
- Search on the map itself (a pin for the hit, fly-to before the parcel
  loads).

## Open questions

- **How sign-out clears recent picks:** a hook registered with `Auth`, or a
  list of keys passed to it. This only affects the code's structure, and the
  plan decides it.
