# Plan: address search

| | |
|---|---|
| **Implements** | [`spec.md`](spec.md) (accepted in #19). There's no `intent.md`. |
| **Author** | Claude (drafted for Jackson, owner / approving engineer) |
| **Date** | 2026-11-20 |
| **Status** | Draft. Accepted when merged. |

## Ground rules

- **Branches and PRs.** The feature lands in one PR on its own short-lived
  branch off `main`, after this plan merges. The agent never pushes to `main`,
  and the owner merges.
- **PR titles are conventional commits**, since the repo is squash-merge only and
  the title becomes the commit on `main`. Commits inside the branch are
  conventional too, one per step, because the steps are reviewed commit by commit.
- **Plan and code stay in sync.** If the implementation departs from this plan,
  `plan.md` is updated in the same commit, under "As built". If the departure
  changes the spec, the agent stops and asks the owner first.
- **Verification before "done".** `npm run typecheck`, `npm run lint`, `npm test`
  and `npm run build` pass on every commit. Their output, and the smoke run's,
  go in the PR description.
- **Exact pins.** New and bumped dependencies are pinned to an exact version, as
  in `package.json` today.
- **Synthetic values only.** Fixtures, tests and the smoke checklist use the
  civil-os synthetic data and the `dev@example.com` user. They don't use real
  addresses.

## Environment

- **SDK:** `@civil-labs/civil-os-api` 0.4.1 is on npm and contains
  `SearchParcelsAddresses` (checked 2026-11-20). Compared with 0.4.0, only
  `parcels_pb` (the new RPC) and a comment in `pagination_pb` change, so the
  bump alone shouldn't break anything.
- **Downshift:** `downshift` 9.5.0 is the current release (published
  2026-11-09). Its peer dependency is `react >=16.12.0`. Checked in its
  source (2026-11-20):
  - Escape closes the popup, and a second Escape clears the input, as in the spec.
  - Enter during IME composition (`which === 229`) is ignored.
  - Status messages are announced only if `getA11yStatusMessage` is passed.
  - Its only styles are set through `element.style`, which the CSP allows.
- **The local Civil OS stack** (`mise run up` in civil-os, at #69 or later) is
  needed only for the smoke run. It serves `SearchParcelsAddresses` against the
  synthetic data.

## Decisions the spec leaves to the plan

| Question | Decision |
|---|---|
| How sign-out clears recent picks (the spec's open question) | **A hook on `Auth`:** `auth.onSignOut(listener): () => void`. `signOut()` runs every listener, each in its own `try`/`catch` so a failing hook can't block sign-out, then calls `clearAndSignIn`. `main.tsx` registers `() => recentPicks.clear()`. `Auth` never learns the storage key. `clearAndSignIn` doesn't run the hooks, so an expired session keeps the picks, as the spec says. |
| How the store knows `sub` | `RecentPicks` takes `auth`'s `subscribe` and `getUser`. The key is `recordKeeper.recentPicks.{getUser()?.profile.sub}`, re-read when the user changes. With no user, the list is empty and nothing is stored. |
| How the store reaches the navbar | As `definitionChoice` does: it's created in `main.tsx`, added to `RouterContext`, and `AppLayout` passes it to `<Navbar recentPicks>`. `renderApp` in `test/appRouter.tsx` gets an in-memory one. |
| Hand-written or a library | **Downshift `useCombobox`, `9.5.0`.** It's a headless hook: it renders no elements and has no styles, so it isn't a component kit under the MVP's "no component kit" rule, and StyleX still styles every element. It covers the parts of the ARIA combobox pattern that are easiest to get wrong by hand: blur before click, IME, scrolling the active option into view, and stable option IDs. The spec's keyboard table is what it's tested against. |
| How a pick is handled | `selectedItem` is controlled and always `null`, so picking the same parcel twice still triggers. `onStateChange` acts on `ItemClick` and `InputKeyDownEnter` with an item: it records the pick, clears `inputValue`, blurs the input and navigates to `/parcels/$parcelId`. |
| What the listbox holds | One `items` array: the recent picks when the input is empty, otherwise the hits. The "Recent" heading is an `<li role="presentation">`, not an item. The hint, "Searching…", the footer and the error sit **outside** the `<ul role="listbox">`, in the popup wrapper, because a listbox may contain only options and groups. |
| Opening on focus | Downshift doesn't open on focus, so `onFocus` calls `openMenu()` when there's something to show (recent picks, the hint, hits or a status line). |
| Live region | The spec's own `role="status"` element. `getA11yStatusMessage` isn't passed, so nothing is announced twice. |
| How the work is split | **Two PRs.** This plan, with the spec fix below, is the first. The feature is the second, as one PR with one commit per step. A `feat:` title makes release-please open a release PR. |

## PR overview

| PR | Branch | Title | Depends on |
|---|---|---|---|
| 1 | `docs/address-search-plan` | `docs: plan for address search` | the spec (#19) |
| 2 | `feat/address-search` | `feat: search parcels by address from the navbar` | PR 1 |

## PR 1: the plan (`docs/address-search-plan`)

1. **`docs: describe the click-to-pick requirement by behaviour`**: the spec's
   "Markup and keyboard" said an option's `mousedown` calls `preventDefault`.
   It now states the behaviour (the blur before a click doesn't close the popup
   or drop the pick, and the input keeps focus until the pick) and leaves the
   mechanism open. Downshift tracks the mouse and ignores that blur instead.
2. **`docs: plan for address search`**: this file.

## PR 2: the feature (`feat/address-search`)

1. **`build(deps): civil-os-api 0.4.1`**
   - Only `package.json` and `package-lock.json` change.
   - `typecheck`, `lint`, `test` and `build` pass with no source changes. If
     they don't, stop: the bump wasn't additive after all.
2. **`feat: query normalisation and debounce`**
   - `search/query.ts`: `normalizeQuery` and `isSearchable`, as in the spec's
     [Normalising and the minimum length](spec.md#normalising-and-the-minimum-length).
   - `search/useDebouncedValue.ts`: `useDebouncedValue<T>(value, ms)`. A
     `setTimeout` in an effect, cleared on change and unmount, with no refs
     read during render (react-hooks v7 rules).
   - Tests: the spec's `query.ts` cases, and the debounce with fake timers.
3. **`feat: per-user recent picks store`**
   - `search/recentPicks.ts`: a `RecentPicks` class modelled on
     `DefinitionChoice`, with `fromWindow`, `start(win)`, `get`, `subscribe`,
     `push(pick)` and `clear()`. Every storage access is guarded. The stored
     value is validated on read (an array of up to 5 objects with string
     `parcelId` and `formattedAddress`), and anything else reads as empty.
   - It follows the user through `auth.subscribe`. When `sub` changes it
     re-reads under the new key and notifies.
   - Tests: the spec's `recentPicks.ts` cases, plus a user change switching
     keys and no user storing nothing.
4. **`feat: clear recent picks on sign-out`**
   - `auth.ts`: `onSignOut`, and `signOut` running the hooks before
     `clearAndSignIn`.
   - `main.tsx`: create the store, `start(window)`, and register
     `auth.onSignOut(() => recentPicks.clear())`.
   - `router.tsx`: `recentPicks` in `RouterContext`. `AppLayout` passes it to
     `Navbar`.
   - `test/appRouter.tsx`: `signedInAuth()` gains `onSignOut`, and `renderApp`
     passes an in-memory `RecentPicks`.
   - Tests (`auth.test.ts`): `signOut` runs every hook, then redirects; a hook
     that throws doesn't stop the redirect; `clearAndSignIn` runs none.
5. **`feat: address search query`**
   - `api/search.ts`: `useAddressSearch(raw)` wraps `useDebouncedValue`,
     `isSearchable` and the spec's `useQuery` call (`skipToken`,
     `keepPreviousData`, `staleTime: 30_000`, `refetchOnWindowFocus: false`).
     It returns the hits, `hasNextPage`, `isPlaceholderData`, the error, and
     whether the raw text is too short.
   - `test/fixtures.ts`: search hits, including two parcels that share an
     address.
   - Tests, with `createRouterTransport`:
     - one call per debounced burst, with `{ query, first: 10 }` and no
       `legalAsOf`;
     - no call below the minimum;
     - a superseded request's `AbortSignal` fires;
     - a slow old response doesn't replace a newer one.
6. **`feat: address search combobox in the navbar`**
   - `npm install --save-exact downshift@9.5.0`.
   - `components/AddressSearch.tsx`, on `useCombobox`, following the decisions
     above. StyleX styles next to it:
     - the input is `flex: 1` between `12rem` and `32rem`;
     - the popup is absolutely positioned under the input, with a new
       `zIndex.popup` token in `theme/tokens.stylex.ts` above the map;
     - earlier hits are dimmed while the next search loads.
   - `components/Navbar.tsx`: renders `<AddressSearch recentPicks>` between
     the app name and the user block. The user's name gets
     `overflow: hidden; text-overflow: ellipsis` so it gives way first.
   - Tests (`AddressSearch.test.tsx`, under a memory-history router):
     - every row of the spec's keyboard table: ↓/↑ wrap, Enter picks, Enter
       with nothing highlighted does nothing, Escape closes, Escape again
       clears, and Tab closes;
     - no option is highlighted when the popup opens;
     - `aria-expanded` and `aria-activedescendant` follow the popup and the
       active option;
     - every row of the spec's "What the popup shows" table, including two
       parcels with the same text;
     - a click picks: it navigates to `/parcels/{parcelId}`, clears and blurs
       the input, and records the pick;
     - picking the same parcel twice navigates both times;
     - focusing an empty box lists recent picks, and picking one makes no RPC
       call;
     - the live region's text for each count, and for "Searching…";
     - a failed search shows the alert line and nothing else on the page
       changes.
     - These double as the guard for Downshift upgrades: a changed default
       fails CI.
   - `Navbar.test.tsx`: the search box is rendered. Sign-out still calls
     `auth.signOut` (clearing is covered in step 4).
   - Check `npm run build`: the bundle shouldn't contain Downshift's legacy
     `<Downshift>` component or `react-is`. If it does, record the size under
     "As built". Leaving it in isn't a blocker.
7. **`docs: address search smoke checklist`**
   - `docs/address-search/smoke.md`, run against civil-os `mise run up` with
     the synthetic data. The run uses `npm run dev`, then `npm run preview`
     for the CSP check:
     1. Search for a fixture address. Pick it with the keyboard and check that
        the map moves to the parcel.
     2. Search with a typo (`fxture way`) and check the parcel is still found.
     3. Search a broad query (`fixture way`): the footer shows, and "Searching…"
        dims the previous hits while it loads.
     4. On `/parcels/:id`, check that the popup draws above the map and its
        controls.
     5. Reload: recent picks are still listed. Sign out and sign back in:
        they're gone.
     6. Under `npm run preview`, check the console for CSP violations while
        searching.
     7. Using VoiceOver or NVDA, whichever is to hand, check that the active
        option and the result count are read out.
   - The results go in the PR description.

**As built:**

- Step 1: no source changes were needed. Before the feature, the checks pass
  with 22 test files and 180 tests, and the bundle is 1,776.63 kB (491.02 kB
  gzipped).
- Step 4:
  - The sign-out tests are in `auth.session.test.ts`, next to the existing
    sign-out test that uses its fake `UserManager`, not in `auth.test.ts`.
  - The hooks run before `removeUser()`, which a test enforces. Removing the
    user fires `userUnloaded`, which resets the store's `sub`, so a later
    `clear()` wouldn't know which key to delete.
  - `AppLayout` passing `recentPicks` to `Navbar` moved to step 6, where
    `Navbar` first uses it.
- Step 5:
  - The tests use real timers and `waitFor`, not fake timers. Debouncing at
    250 ms fits well inside `waitFor`'s default timeout, and there was no
    flakiness in three runs in a row.
  - Cancellation works: a request that never answers on its own is aborted
    when the text changes. The router transport also aborts a call's signal
    once the call finishes, so only the superseded call's signal is checked.
- Step 6:
  - Four Downshift defaults differed from the spec. Each is fixed and
    tested:
    - On blur (Tab, or a click elsewhere), Downshift picks the highlighted
      option. The spec says Tab only closes the popup.
    - Downshift handles Enter with no active option by closing the popup.
      The spec says it does nothing.
    - Downshift toggles the popup when the input is clicked. A click on the
      unfocused box fires focus (which opens it) and then click (which
      closed it again), so the recent picks flashed and vanished. Found by
      the owner after the smoke run, which had only focused the box from
      script. A click now always opens the popup, and both the tests and
      the smoke script click into the box.
    - Downshift keeps the highlighted index when its items change. Found in
      the final review. Moving the highlight on the dimmed earlier hits,
      then getting a shorter list, left `aria-activedescendant` on an
      option that no longer existed, and Enter cleared the query without
      navigating. A list of the same length made Enter pick a parcel the
      user never saw highlighted. `highlightedIndex` is now controlled and
      tied to the list it was set on (the hits' parcel IDs, in order), and
      Enter checks the item exists.
  - Picks are handled in `onSelectedItemChange`, not `onStateChange` as the
    decision table says. The behaviour is the same: `selectedItem` is
    controlled and always `null`, so every pick fires it.
  - Arrow keys wrap, nothing is highlighted on open, and Escape-then-clear
    are all Downshift defaults, as checked in the plan.
  - `react-hooks/refs` rejects passing a ref into `getInputProps` during
    render. The input gets a `useId` through Downshift's `inputId`, and a
    pick blurs it with `document.getElementById`.
  - The "Recent" heading isn't an `<li role="presentation">` directly in
    the listbox, as the decision table says. A listbox may own only options
    and groups, so the final review flagged the bare text. Recent picks are
    a `role="group"` labelled by the heading, as in the APG's grouped
    listbox. A mousedown on the heading is prevented, so it can't take
    focus from the input.
  - `isSearchable` counts the raw limit in characters (code points), not
    UTF-16 units (`raw.length`) as the spec's comment says. The server's
    `max_len` counts characters. The input's `maxLength` counts UTF-16
    units and stops typing before either limit matters, so this only
    affects text set from script.
  - The sign-out clearing is wired by `connectRecentPicks` in
    `search/recentPicks.ts`, which `main.tsx` calls. It's tested end to
    end with a real `Auth` and `localStorage`, instead of through
    `Navbar.test.tsx` as the spec's testing list says: `Navbar` only calls
    `auth.signOut`.
  - The popup's z-index token is `layers.popup` (`10`), since StyleX
    variables are grouped by kind in `tokens.stylex.ts`.
  - `Navbar.test.tsx` now wraps the navbar in a transport and a
    `QueryClient`, since the navbar renders search.
  - "Picking the same parcel twice": a pick always records and navigates,
    but navigating to the URL you're already on doesn't add a history entry.
    The test goes somewhere else between the two picks.
  - The bundle grew 45.92 kB (14.07 kB gzipped) for Downshift and the new
    code: 1,822.55 kB (505.09 kB gzipped), up from 1,776.63 kB (491.02 kB).
    The legacy `<Downshift>` component appears to be included (its name is
    in the bundle) despite `"sideEffects": false`. Per the plan, that isn't
    a blocker.

## Final verification (before reporting the feature done)

- `typecheck`, `lint`, `test` and `build` pass on the final commit, and the
  output is in the PR description.
- The smoke checklist has been run end to end, with the results in the PR.
- An agent with fresh context walks every section of `spec.md` against the
  diff, and reports any requirement with no code or no test.

**As built (2026-11-21):**

- The review found one bug (the stale highlight), one accessibility error
  (bare text in the listbox) and a related focus problem on the heading,
  two weak spots in the tests (an ordering test that couldn't fail, and an
  untested sign-out wiring line), one unrecorded departure (`isSearchable`
  counting characters), and two slips in this file. All are fixed or
  recorded above.
- One finding is accepted: after an error, an edit undone within 250 ms
  doesn't retry, because the debounced text never changes. Any edit that
  settles on different text retries, which is what the spec means by
  "typing again".
- Smoke checklist: sections 1–7 were scripted in headless Firefox 160
  against the local stack, all passing, including a CSP run under
  `npm run preview`. Section 8 (a screen reader, run by the owner) passed.

## Risks

| Risk | Mitigation |
|---|---|
| A Downshift default differs from the spec: arrow keys wrapping, an option highlighted on open, Enter with nothing highlighted | Each is a step 6 test. Fix it with `stateReducer`, not by changing the spec. |
| A Downshift upgrade changes behaviour (v8 and v9 both changed hook defaults) | Exact pin, and the step 6 keyboard and state tests. |
| `react-is@18` and the legacy component get bundled next to React 19 | Checked in step 6's build output and recorded. It costs bytes, not correctness. |
| The CSP blocks Downshift's styles | Its only styles go through `element.style`, which CSP allows. Smoke step 6 confirms it. |
| The popup draws under the MapLibre canvas or controls | A `zIndex.popup` token, and smoke step 4. |
| The navbar gets crowded at narrow widths (it's `nowrap`) | The input shrinks to `12rem`, and the user's name truncates first. |
| Superseded requests aren't actually aborted | Step 5's test shows it. Results still can't appear out of order, since each query text has its own key. If the signal never fires, record it under "As built" and ask the owner before changing the spec's cancellation sentence. |
| Fake timers combined with TanStack Query and RTL make tests flaky | `vi.useFakeTimers({ shouldAdvanceTime: true })`, and wait with `findBy*` queries. |
| The client's `\p{L}\p{N}` check disagrees with PostgreSQL's `[:alnum:]` | Accepted in the spec: a mismatch shows the server's error in the popup. |

## Rejected options

- **A hand-written combobox.** Every behaviour Downshift covers would need
  writing and testing by hand, for one widget.
- **React Aria `useComboBox`.** Better tested across screen readers, but a much
  larger dependency tree for one widget.
- **`useDeferredValue` instead of a debounce.** It defers rendering but still
  makes a request per keystroke.
- **`useInfiniteQuery`.** The spec has no paging.
- **Clearing recent picks inside `clearAndSignIn`.** It would clear them on
  every expired token, which the spec rules out.
- **Passing storage keys to `signOut`.** It would make `Auth` know about every
  store that holds per-user data. A hook keeps `Auth` unaware of them.

## Out of scope for this plan (per spec)

- Owner-name and parcel-number search, a results page, paging past 10, and the
  query in the URL.
- Searching as of a past date, highlighting, and a keyboard shortcut.
- Search on the map itself.
