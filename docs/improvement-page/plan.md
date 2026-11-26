# Plan: improvement page

| | |
|---|---|
| **Implements** | [`spec.md`](spec.md) (accepted in #29). There's no `intent.md`. |
| **Author** | Claude (drafted for Jackson, owner / approving engineer) |
| **Date** | 2026-11-25 |
| **Status** | Draft. Accepted when merged. |

## Ground rules

- **Branches and PRs.** The feature lands in one PR on its own short-lived
  branch off `main`, after this plan merges. The agent never pushes to `main`,
  and the owner merges.
- **PR titles are conventional commits,** since the repo is squash-merge only
  and the title becomes the commit on `main`. Commits inside the branch are
  conventional too, one per step, because the steps are reviewed commit by
  commit.
- **Plan and code stay in sync.** If the implementation departs from this
  plan, `plan.md` is updated in the same commit, under "As built". If the
  departure changes the spec, the agent stops and asks the owner first.
- **Verification before "done".** `npm run typecheck`, `npm run lint`,
  `npm test` and `npm run build` pass on every commit. Their output, and the
  smoke run's, go in the PR description.
- **A failing test means fixing the code,** not the test. The only expected
  outputs that change are the ones the spec changes: improvement IDs that
  were plain text become links ([Testing](spec.md#testing), last bullet).
- **Never `parcels[0]`.** Nothing reads one parcel out of an improvement's
  `parcels` as if it were the only one. In review, grep the diff for
  `parcels[0]` and `parcels.at(`.
- **Synthetic values only.** Fixtures, tests and the smoke run use the civil-os
  synthetic data and the `dev@example.com` user.

## Environment

- **SDK:** `@civil-labs/civil-os-api` 0.6.1 is on npm (checked 2026-11-25).
  - Its typings have `getImprovementsById`, `getImprovementsByPartyId` and
    `getImprovementQualities` on `ImprovementsService`, and the
    `Improvement`, `ImprovementParcel`, `ImprovementShare` and
    `PartyImprovement` messages.
  - `GetImprovementsByPartyIdResponse` holds `improvements:
    PartyImprovement[]` and `pageInfo`, so it fits `PagedList` as it is.
  - Every count on `Improvement` is `?: number`: unset is `undefined`, not 0.
  - The release is additive (`buf breaking` passed upstream), so the bump
    alone typechecks. It gets its own commit (step 1).
- **The local Civil OS stack** at **v0.7.1** or later is needed only for the
  smoke run.
  - **Don't run `mise run down` on the default compose stack:** its database
    may hold data other work depends on.
  - Run the smoke stack as a separate compose project instead:
    1. In civil-os, at `v0.7.1`, stop the default stack:
       `docker compose stop db dex database-reader database-writer gateway tile-server`.
    2. Start the smoke stack: `docker compose -p civil-os-e2e up --build --wait`.
    3. Do the smoke run.
    4. Remove the smoke stack: `docker compose -p civil-os-e2e down -v`.
    5. Restart the default stack: `docker compose start` with the same six
       services.
  - The smoke project publishes the same ports. Check that nothing else holds
    port 8080 (an Argo CD port-forward sometimes does).
- **Browser smoke:** headless Firefox through `puppeteer-core`, installed
  outside the repo, as the packaging and MVP smoke runs did. The checklist is
  walked by a scratch script, never committed, and its output goes in the PR
  description. Anything the script can't check is checked by hand and marked
  so.

## Decisions the spec leaves to the plan

| Question | Decision |
|---|---|
| Where `labels` goes | **`src/api/lookups.ts`,** exported as `labels(map)`, next to the queries whose maps it reads. `ParcelPane` imports it from there. Its body doesn't change. |
| How the owner-names query skips an empty list | **`skipToken`** from TanStack Query when `parties` is empty, so the hook is always called, and no request is made. |
| The owner-names query key | `partiesByIdQuery(transport, partyIds)` passes the IDs in the order the improvement returns them (by party ID), so the same owners always give the same key. It doesn't share a cache entry with `partyQuery` for a single party. The party page keeps `partyQuery` as it is. |
| `improvementQuality` | Added to `UnroutedRecordType`, between `improvementCondition` and `landUseType`. |
| Parcel pane's lookups in the loader | **`prefetchQuery`, not `ensureQueryData`,** for conditions only. Land uses, zoning and neighborhoods stay as they are. A failed conditions lookup must not fail the parcel route (spec: Errors and loading). |
| Improvement loader | `ensureQueryData(improvementQuery(...))` for the improvement, then `void prefetchQuery(...)` for each of the three lookups. The lookups start before the improvement read, in the same tick, so they run in parallel. |
| Second fixture improvement | **`IDS.improvementB`, `53000000-0000-4000-8000-000000000016`.** It's on `IDS.parcel` as not primary and on `IDS.parcelB` (`a0000000-0000-4000-8000-000000000003`, new) as primary. Its `typeId` is known, and its `conditionId` is an ID no lookup knows, which tests the fallback. `qualityId` and the address are unset, `fullBathrooms: 0`, and every other count is unset. |
| Lookup failures in tests | One fake option, `failImprovementLookups`, makes all three lookups fail with `Unavailable`. A second, `failPartiesById`, makes `getPartiesById` fail, for the owner-names test. A third, `failImprovementsByParty`, makes the party section fail. |
| Fake `GetImprovementsByPartyId` | 30 rows for `IDS.partyB`, so a page of 25 has a next page with `after`, as the transfers fake does. Every other party gets none. |
| How the work is split | **Two PRs.** This plan is the first. The feature is the second, as one PR with one commit per step, titled `feat: add the improvement page`. A `feat:` title makes release-please open a minor release PR. Nothing is breaking. |
| Deployment | **Not in this plan.** Moving a deployment to civil-os v0.7.1 and the new Record Keeper release is the owner's, in the deployment repos. The PR description restates the rollout order from the spec: civil-os first. |

## PR overview

| PR | Branch | Title | Depends on |
|---|---|---|---|
| 1 | `docs/improvement-page-plan` | `docs: plan for the improvement page` | the spec (#29) |
| 2 | `feat/improvement-page` | `feat: add the improvement page` | PR 1 |

## PR 1: the plan (`docs/improvement-page-plan`)

1. **`docs: plan for the improvement page`**: this file.

## PR 2: the feature (`feat/improvement-page`)

1. **`build: bump civil-os-api to 0.6.1`**
   - `package.json` pins `"@civil-labs/civil-os-api": "0.6.1"`, and
     `npm install` updates `package-lock.json`.
   - No source changes. All four checks pass, with no test changed.

2. **`feat: name improvement conditions on the parcel pane`**
   - **`lookups.ts`:**
     - adds `improvementTypesQuery`, `improvementConditionsQuery` and
       `improvementQualitiesQuery`, each with `lookupQueryOptions`;
     - takes `labels` over from `ParcelPane.tsx`.
   - **Parcel route loader:** `void queryClient.prefetchQuery(improvementConditionsQuery(transport))`.
   - **`ParcelPane`:**
     - reads the conditions lookup with `useQuery`, and adds
       `conditions: labels(...)` to the names it passes;
     - "Primary condition" takes `text: summary?.primaryConditionId && names.conditions[summary.primaryConditionId]`.
   - **Fixtures:** the fake serves the three lookups, plus
     `failImprovementLookups`, with these entries:
     - type `50000000-…-000000000001`, "Single family dwelling";
     - condition `51000000-…-000000000002`, "Average";
     - quality `52000000-…-000000000001`, "Fixture Standard".

     The parcel fixture's `primaryConditionId` becomes condition 2.
   - **Tests (`ParcelPane.test.tsx`):** "Primary condition" shows "Average".
     With `failImprovementLookups`, it shows the ID, and the rest of the pane
     still renders.

3. **`feat: add the improvement page`**
   - **`src/api/improvements.ts`:**
     `improvementQuery(transport, improvementId)` calls
     `getImprovementsById` with `{ improvementIds: [improvementId] }`.
   - **`src/api/parties.ts`:** `partiesByIdQuery(transport, partyIds)`.
   - **`src/links.tsx`:**
     - the `improvement` entry moves to the routed table;
     - `improvementQuality` is added as unrouted.
   - **`src/router.tsx`:** `improvementRoute` at `improvements/$improvementId`:
     - `parseUuid`, and the loader from the decision above;
     - `notFoundComponent` says "No improvement with this ID.";
     - registered next to `partyRoute`.
   - **`src/routes/ImprovementPage.tsx`:**
     - the heading, the fields table and the two sections, as the spec has them;
     - `improvementFields(improvement, names)` and
       `improvementLabel(improvement, typeNames)`, kept pure and exported for
       tests;
     - the Owners section's table header is "Party" and "Ownership share",
       matching the party page's Parcels table.
   - **Fixtures:**
     - `IDS.improvement`, matching the spec's Testing table: 
       - type 1, condition 2, quality 1, and `IDS.address` with
         "2 Fixture Way, Testville ZZ000";
       - `areaSqFt: 1399.307`, `fullBathrooms: 2`, `bathrooms: 2`,
         `bedrooms: 3`, `units: 1`, `yearBuilt: 1982`,
         `effectiveYearBuilt: 1992`, and a small `properties` object;
       - a primary link to `IDS.parcel`;
       - owners `IDS.partyA` and `IDS.partyB` at `0.5000`;
     - `IDS.improvementB`, from the decision above;
     - `getPartiesById` returns `IDS.partyA` and `IDS.partyB` with names,
       plus `failPartiesById`.
   - **Tests:**
     - **`ImprovementPage.test.tsx`:** each bullet in the spec's
       `ImprovementPage` list, through `renderApp('/improvements/…')`, plus
       `improvementLabel`'s four cases;
     - **`links.test.tsx`:** `improvement` moves to the routed cases, and
       `improvementQuality` joins the unrouted ones;
     - **`router.test.tsx`:**
       - `/improvements/not-a-uuid` joins the "without an API call" table;
       - an ID the fake leaves out shows "No improvement with this ID.";
       - hovering an improvement link on the address page calls
         `getImprovementsById` before the click;
     - **existing tests** that asserted plain-text improvement IDs now expect
       links to `/improvements/:id`: `TransferPage.test.tsx`,
       `AddressPage.test.tsx` and `ParcelPane.test.tsx`.

4. **`feat: list a party's improvements`**
   - **`src/api/parties.ts`:** `useImprovementsByParty(partyId)` and
     `improvementsByPartyRows`, as `useParcelsByParty` is built.
   - **`PartyPage.tsx`:** `ImprovementsSection`, between Parcels and
     Transfers. Its table header is "Improvement" and "Ownership share".
   - **Fixtures:** `getImprovementsByPartyId`, from the decision above, and
     `failImprovementsByParty`.
   - **Tests (`PartyPage.test.tsx`):**
     - party B lists 25 rows, and "More" loads 5 more with `after`;
     - party A shows the empty state;
     - with `failImprovementsByParty`, the section shows the error, and
       Parcels and Transfers still render.

5. **`docs: improvement page smoke checklist and MVP spec updates`**
   - **`docs/improvement-page/smoke.md`:** new.
     - Setup as in `docs/mvp/smoke.md`, but on the separate compose project
       from [Environment](#environment), with civil-os v0.7.1 or later.
     - The checklist items from the spec's Testing section, as `- [ ]` lines.
     - The short-ID table for the improvements, parties and parcels it uses.
   - **`docs/mvp/spec.md`:** these places, each with a note that the
     improvement page spec changed it:
     - the rendering rule's no-route row drops improvements and adds
       improvement qualities;
     - the Party section's table gains the Improvements row;
     - the code layout gains `api/improvements.ts` and `ImprovementPage.tsx`.
   - **`docs/mvp/smoke.md`:**
     - section 3's "Improvement IDs are plain text" becomes "Improvement IDs
       open their improvement pages";
     - setup says civil-os v0.7.1 or later.
   - **Run the smoke checklist** (Environment) and paste its results in the
     PR description.

**Checks (every commit):** `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`.

## Final verification (before reporting PR 2 done)

- **Spec coverage.** Each line of the spec's Testing section has a test or a
  smoke item that checks it. The PR description gives a table mapping each
  line to its test name or checklist line.
- **Every improvement ID is a link.** Grep `src/` for `type="improvement"` and
  `type: 'improvement'`, and confirm no remaining test expects improvement IDs
  as plain text.
- **No values and no legal time.** Grep the diff for `valuationId`,
  `legalAsOf`, `marketValue` and `assessedValue`. Nothing should match.
- **One parcel is never assumed.** Grep the diff for `parcels[0]` and
  `parcels.at(`. Nothing should match.
- **Old stack.** Against civil-os v0.7.0 (`Unimplemented` for the new RPCs), the
  improvement page shows the route's error. The party page shows the error in
  its Improvements section only, and every other page works. This is checked
  by hand once, with the result in the PR description. If an older stack
  isn't practical to run, the check uses the fake's failure options instead,
  and the description says so.

## Risks

| Risk | Mitigation |
|---|---|
| The parcel loader's lookups use `ensureQueryData`, so copying that pattern for conditions would make a failed conditions lookup fail the whole pane. | The decision above uses `prefetchQuery`, and step 2's test makes the lookup fail and checks that the pane still renders. |
| `Fields`' `text` kind shows `0` and hides `undefined`, which is exactly the unset-is-not-zero rule. A helper that coerced with `?? 0` or `\|\|` would break it. | Step 3 passes the optional fields straight through, and `improvementB`'s `fullBathrooms: 0` test pins it. |
| Turning improvement IDs into links changes three existing tests. That could hide a real regression among the expected ones. | Step 3 changes only the improvement-ID assertions in those tests. Each one now checks for a link with the exact `/improvements/:id` href, not just that some link exists. |
| The owner-names query and `partyQuery` cache the same party twice. | Harmless: both are reads of current data, and the cache's usual stale time applies to each. Noted, not merged. |
| No fixture has an address with an unknown type, so the heading's "address alone" case wouldn't be reached through the page. | The label is an exported pure function, `improvementLabel(improvement, typeNames)`. A unit test covers all four cases: both, type only, address only, neither. `improvementB`'s unknown condition covers the field fallback through the page. |

## As built

- **Step 3, a fourth existing test.** `Fields.test.tsx` used `improvement` as
  its example of a record type with no page. The example is now
  `improvementType`, so the test still checks plain text for an unrouted
  type. No assertion was loosened.

## Out of scope for this plan (per spec)

A valuation picker; legal-time reads; transfers by improvement; pages for
improvement types, conditions and qualities; improvement geometry on the map;
editing; deployment.
