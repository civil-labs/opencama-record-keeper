# Plan: civil-os 0.6 and public API 0.5

| | |
|---|---|
| **Implements** | [`spec.md`](spec.md) (accepted in #23). There's no `intent.md`. |
| **Author** | Claude (drafted for Jackson, owner / approving engineer) |
| **Date** | 2026-11-22 |
| **Status** | Draft. Accepted when merged. |

## Ground rules

- **Branches and PRs.** The change lands in one PR on its own short-lived
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
- **No behavior changes.** No test's expected output changes. Tests change only
  in how fixtures are built and which service they register.
- **Synthetic values only.** Fixtures, tests and the smoke run use the civil-os
  synthetic data and the `dev@example.com` user.

## Environment

- **SDK:** `@civil-labs/civil-os-api` 0.5.0 is on npm (checked 2026-11-22). Its
  typings have `NeighborhoodsService` and `ValuationsService`, and no
  `NeighborhoodService`. `getParcelsByAddressId` and `getParcelsByPartyId` are
  on `ParcelsService`, `getImprovementsByAddressId` on `ImprovementsService`,
  and `getPartiesByAddressId` on `PartiesService`. No response has `edges`.
  Paged responses hold plain arrays (`transfers: RealPropertyTransfer[]`).
- **Unlike the 0.4.1 bump, this one isn't additive.** The bump alone doesn't
  typecheck, so the bump, the renames and the new row fields go in one commit
  (step 2). Step 1 gets `PagedList` ready first, on 0.4.1, so step 2 has as
  little as possible in it.
- **The local Civil OS stack** at **v0.6.0** (`git checkout v0.6.0`, then
  `mise run down` and `mise run up` in civil-os) is needed for the smoke run.
  An older stack answers the moved RPCs with `Unimplemented`.
- **Squash merges have a blank body** (`squash_merge_commit_message: BLANK`).
  On `main`, only the PR title survives. See the first row of the next table.

## Decisions the spec leaves to the plan

| Question | Decision |
|---|---|
| How release-please learns about the break | **A `!` in the PR title:** `feat!: run against civil-os 0.6 and public API 0.5`. The spec says a `BREAKING CHANGE:` footer on the bump commit, but squash merges drop commit bodies, so a footer wouldn't reach `main`. release-please reads `!` as a breaking change. Under `bump-minor-pre-major`, that makes 0.1.1 → 0.2.0, as the spec says. PR 1 fixes the spec's wording (below). The PR description still says the app needs civil-os v0.6.0. |
| Where the row-field functions live | **Next to the hooks.** Each `use…` hook in `src/api/` and `TransfersList.tsx` is matched by a function such as `parcelsByAddressRows = (page) => page.parcels`. The caller passes it as `rows`. The field name sits next to the method that returns it. |
| `PagedList`'s types | `PagedList<P extends Page, T>` takes `query: UseInfiniteQueryResult<InfiniteData<P>, ConnectError>` and `rows: (page: P) => T[]`. `P` is inferred from `query` and `T` from `rows`. `Page` keeps only `pageInfo`. |
| `TransfersList`'s prop type | `UseInfiniteQueryResult<InfiniteData<TransfersPage>, ConnectError>`, where `TransfersPage = { transfers: RealPropertyTransfer[] } & Page`. Both transfer responses (by parcel, by party) fit it. |
| The fixtures' `pageInfo` | Unchanged. Fixtures already send `endCursor`, and the client never read per-row cursors. |
| How the work is split | **Two PRs.** This plan, with the spec fix, is the first. The change is the second, as one PR with one commit per step. |

## PR overview

| PR | Branch | Title | Depends on |
|---|---|---|---|
| 1 | `docs/civil-os-0.6-plan` | `docs: plan for civil-os 0.6 and public API 0.5` | the spec (#23) |
| 2 | `feat/civil-os-0.6` | `feat!: run against civil-os 0.6 and public API 0.5` | PR 1 |
| 3 | gitops `feat/civil-os-v0.6.0` | `feat: run civil-os v0.6.0 and Record Keeper v0.2.0 in prod/fl-lee` | PR 2, then its release PR (v0.2.0) |

## PR 1: the plan (`docs/civil-os-0.6-plan`)

1. **`docs: mark the break with a bang in the PR title`**: the spec's Rollout
   bullet said the bump commit carries a `BREAKING CHANGE:` footer. It now says
   the PR title carries `!`, because squash merges keep only the title.
2. **`docs: plan for civil-os 0.6 and public API 0.5`**: this file.

## PR 2: the change (`feat/civil-os-0.6`)

1. **`refactor: let callers name the rows of a page`**
   - Still on 0.4.1. `PagedList` takes `rows` and drops `edges`/`node` from
     `Page`. It flattens with `query.data.pages.flatMap(rows)`.
   - Each caller passes a function that reads 0.4.1's shape for now:
     `(page) => page.edges.flatMap((e) => (e.node ? [e.node] : []))`. Each
     function sits next to its hook (decision above), so step 2 changes only
     that one line in each.
   - `TransfersList` gets its `TransfersPage` prop type, written against
     0.4.1's `edges` for now.
   - Checks pass with no test changes. This step is safe on its own.
   - **As built:** the 0.4.1 reading is one temporary helper, `edgeNodes(page)`
     in `PagedList.tsx`, which every row function called. Step 2 deleted it.
     Checks: 28 test files and 254 tests pass. The bundle is 1,823.22 kB
     (505.24 kB gzipped).
2. **`feat!: public API 0.5`**
   - `npm install --save-exact @civil-labs/civil-os-api@0.5.0`.
   - `src/api/lookups.ts`: `NeighborhoodsService`.
   - `src/api/addresses.ts`: the three reverse lookups on `ParcelsService`,
     `ImprovementsService` and `PartiesService`. The hooks keep their names.
   - `src/api/parties.ts`: `getParcelsByPartyId` on `ParcelsService`.
   - The row functions from step 1 become `(page) => page.transfers`,
     `.parcels`, `.improvements` and `.parties`. `TransfersPage` uses
     `transfers`.
   - `src/test/fixtures.ts`: the moved handlers register on their new
     services. Responses return arrays in the new fields, with no edges or
     per-row cursors. `pageInfo` and the `record()` names stay.
   - `src/routes/LookupPage.test.tsx`: `NeighborhoodsService`.
   - The commit body has the `BREAKING CHANGE:` note anyway, for anyone
     reading the branch. The PR title is what release-please sees.
   - Checks pass. No expected value in any test changes: `git diff` on
     `*.test.tsx` shows only imports and service names.
   - **As built:** `ParcelsService` was already registered in the fixtures, so
     the two moved parcel lookups joined that block instead of a second
     `router.service` call. `ImprovementsService` got its first block. No
     route or component changed apart from the row functions. The only
     test-file change is `NeighborhoodsService` in `LookupPage.test.tsx`.
     Checks: 28 test files and 254 tests pass. The bundle is 1,824.56 kB
     (505.60 kB gzipped).
3. **`docs: civil-os 0.6 service names in the MVP spec and smoke checklists`**
   - `docs/mvp/spec.md`, lines 521, 668, 696–698 and 714: the new service names,
     with a note that `docs/civil-os-0.6/spec.md` changed them.
   - `docs/address-search/smoke.md` and `docs/mvp/smoke.md`: civil-os
     **v0.6.0 or later**.
   - **As built:** `docs/mvp/spec.md` also gets a **Changed by** row in its
     header table (it had no way to note later specs), and its stack table's
     SDK pin, which still said `0.4.0`, now says `0.5.0`.
4. **Smoke run** (no commit unless the checklists need fixing)
   - Against the v0.6.0 local stack, run `docs/mvp/smoke.md` and
     `docs/address-search/smoke.md`, scripted in headless Firefox as before.
   - Also check the spec's [Smoke](spec.md#smoke) items: "More" on a party's
     transfers and on an address with more than 25 parcels (if the synthetic
     data has none, say so in the PR description), and the lookup page's
     neighborhoods.
   - Results go in the PR description.

## PR 3: prod (gitops)

After PR 2 merges and release-please's PR cuts **v0.2.0**:

- In `environments/prod/fl-lee/values.yaml`, set `civil_os.version: v0.6.0`
  and `opencama_record_keeper.version: v0.2.0` in **one commit**.
- After the sync, open `https://records-leepa.civillabs.app` and load an
  address page, a party page and the lookup page. Search for an address.
- Nobody depends on prod yet, so the short window while the two apps sync
  separately is accepted (spec: Rollout).

## Final verification (before reporting PR 2 done)

- `typecheck`, `lint`, `test` and `build` pass on the final commit, with the
  output in the PR description.
- The smoke run has passed against civil-os v0.6.0, with results in the PR.
- An agent with fresh context walks every section of `spec.md` against the
  diff, and reports any requirement with no code or no test, and any test
  whose expected output changed.

## Risks

| Risk | Mitigation |
|---|---|
| A transfer list quietly shows "None." because a row function reads the wrong field | Every field name is type-checked against the SDK's response type, and the existing "More" and transfer tests assert real rows. |
| Connect-Query's cache keys change with the service names | Nothing persists query keys. A full reload after deploy starts clean. |
| A test's expected output has to change to pass | Stop: behavior changed, which the spec rules out. Find out why before going on. |
| The smoke run uses a civil-os stack older than v0.6.0 | The environment section pins `v0.6.0`. Every moved RPC failing with `Unimplemented` is the symptom. |
| The version bump doesn't come out as 0.2.0 | The `!` in the PR title. Check the release PR's version before merging it. |
| Prod runs mismatched versions for longer than one sync | Both versions are in one gitops commit. If one app's sync fails, sync the other back, or finish the stuck one by hand. |

## Rejected options

- **A single commit for PR 2.** The `PagedList` refactor stands on its own on
  0.4.1, and splitting it out keeps the breaking commit small enough to review.
- **Making `Page<T>` generic over a field name** (such as
  `Page<'transfers', RealPropertyTransfer>`). It's harder to read than a
  `rows` function and gains nothing.
- **Using `select` on each `useInfiniteQuery` to flatten rows.** It would
  change the shape `PagedList` gets for paging state, and spread the change
  through more code.
- **A `BREAKING CHANGE:` footer alone.** Squash merges drop it (see the
  decisions above).

## Out of scope for this plan (per spec)

- Using anything new in 0.5.0. It adds no RPCs.
- Supporting more than one civil-os version at once.
- Moving hooks between `src/api/` files to match the new services.
