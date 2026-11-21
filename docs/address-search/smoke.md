# Address search: smoke checklist

This checklist walks [spec.md](spec.md) against the civil-os local stack and
its synthetic data. Run it before calling a change to address search done.
The data is described in the header of civil-os
`database/fixtures/synthetic.sql`. Parcel *n* has the address
"*n* Fixture Way, Testville ZZ000".

## Setup

1. In civil-os (at #69 or later), start from a clean stack: `mise run down`,
   then `mise run up`.
2. Here, run `npm ci`, then `npm run dev`, and open <http://localhost:3000>.
3. Sign in as `dev@example.com` with password `civil-os-dev-password`, the
   local Dex's throwaway user (civil-os `dev/dex.yaml`).
4. Open the browser's devtools: the Network tab, filtered to
   `SearchParcelsAddresses`, and the Console.

## 1. The box

- [ ] The navbar shows a "Search addresses" box between "Record Keeper" and
      the user's name, on `/parcels` and on a record page such as
      `/parties/30000000-0000-4000-8000-000000000003`.
- [ ] Focusing the empty box opens nothing (no recent picks yet).
- [ ] Narrowing the window shrinks the box, and the user's name truncates
      before the box gets smaller than about 12rem.

## 2. Typing

- [ ] Typing `12` shows "Type at least 3 letters or numbers." and makes no
      request.
- [ ] Typing `fixture way` quickly makes **one** request, about a quarter
      second after the last key, with `query: "fixture way"` and `first: 10`,
      and no `legalAsOf`.
- [ ] It shows 10 addresses and "More matches. Keep typing to narrow down."
- [ ] Typing `12 fixture` puts "12 Fixture Way, Testville ZZ000" first.
- [ ] Typing a typo, `fxture way`, still finds Fixture Way addresses.
- [ ] Typing `old fixture way` never lists "5 Old Fixture Way": address 5's
      old line is historical. Current Fixture Way addresses still match, by
      similarity.
- [ ] Typing `20 fixture way` or `21 fixture way` never lists
      "20 Fixture Way" (voided parcel 20) or "21 Fixture Way" (address 21 is
      on no parcel).
- [ ] Typing `2 fixture way` lists "2 Fixture Way" once: parcel 21 shares
      that address but has no geometry, so it's hidden.
- [ ] While a new search loads after an earlier one, the earlier addresses
      stay, dimmed, with "Searching…". Throttle the network in devtools to
      see it.
- [ ] Typing fast across several pauses never shows an older list after a
      newer one.

## 3. Picking

- [ ] With `12 fixture` typed, ↓ highlights the first option, and ↓/↑ wrap
      around the list.
- [ ] Enter with nothing highlighted does nothing.
- [ ] Enter on a highlighted option goes to that parcel's
      `/parcels/<id>`: the map moves to it and highlights it, the box empties
      and loses focus.
- [ ] Back returns to where you were.
- [ ] Clicking an option does the same as Enter.
- [ ] Escape closes the popup. Escape again clears the box.
- [ ] Tab with an option highlighted closes the popup and moves focus on,
      **without** going to the parcel.

## 4. Over the map

- [ ] On `/parcels/<id>`, the popup draws above the map, its controls and the
      detail pane.

## 5. Recent picks

- [ ] After picking two parcels, clicking into the empty box shows "Recent"
      and both, newest first. Click elsewhere, then click back in: the list
      opens and stays open, with no flash. Picking one goes to it with no
      `SearchParcelsAddresses` request.
- [ ] Picking a sixth parcel drops the oldest. Picking a listed one again
      moves it to the top.
- [ ] Reloading keeps them. A second tab shows them too.
- [ ] Application → Local Storage shows them under
      `recordKeeper.recentPicks.<sub>`.
- [ ] "Sign out", then sign back in: the list is empty and the key is gone.

Blocked site data can't be checked here: sign-in itself keeps the session in
`localStorage`, so the app can't be used without it. The store's fallback to
memory is covered by `recentPicks.test.ts`.

## 6. Errors

- [ ] With the civil-os gateway stopped (`docker stop` its container),
      searching shows one "Search failed: …" line in the popup, and the rest
      of the page still works. A refused connection is reported as
      `Unknown. NetworkError when attempting to fetch resource.` Start the
      gateway again afterwards.

## 7. CSP

- [ ] Stop the dev server. Run `npm run build`, then `npm run preview`, and
      repeat a search and a pick. The console shows no
      Content-Security-Policy violations.

## 8. Screen reader

With VoiceOver or NVDA, whichever is to hand:

- [ ] The box is announced as "Search addresses", a combo box.
- [ ] The result count is read out ("10 results, more available").
- [ ] Moving with ↓/↑ reads each option.
