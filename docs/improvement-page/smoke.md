# Improvement page: smoke checklist

This checklist walks [the improvement page spec](spec.md) against the civil-os
local stack and its synthetic data. Run it before calling a change to the
improvement page or the party page's Improvements section done. Every ID
below comes from the civil-os fixtures (`internal/testutil/fixtures.go` and
the header of `database/fixtures/synthetic.sql`).

## Setup

1. **Start civil-os v0.7.1 or later on the synthetic data.**
   - On a machine whose default compose stack holds only the synthetic
     fixtures, `mise run up` in civil-os is enough.
   - If the default stack's database holds anything worth keeping, don't
     `mise run down` it. Run the checklist on a separate compose project
     instead. In civil-os:
     1. Stop the default stack:
        `docker compose stop db dex database-reader database-writer gateway tile-server`.
     2. Start the smoke project: `docker compose -p civil-os-e2e up --build --wait`.
        It publishes the same ports, so nothing else may hold 8080.
     3. Afterwards, remove it with `docker compose -p civil-os-e2e down -v`,
        and restart the default stack with `docker compose start` and the
        same six services.
2. Here, run `npm ci`, then `npm run dev`, and open <http://localhost:3000>.
3. Sign in as `dev@example.com` with password `civil-os-dev-password`.

Short IDs below are the last digits of the fixture UUIDs:

| Short ID | Full ID |
|---|---|
| improvement 1 | `53000000-0000-4000-8000-000000000001` |
| improvement 2 | `53000000-0000-4000-8000-000000000002` |
| improvement 3 | `53000000-0000-4000-8000-000000000003` |
| improvement 16 | `53000000-0000-4000-8000-000000000016` |
| improvement 17 | `53000000-0000-4000-8000-000000000017` |
| improvement 18 | `53000000-0000-4000-8000-000000000018` |
| parcel 2 | `a0000000-0000-4000-8000-000000000002` |
| parcel 3 | `a0000000-0000-4000-8000-000000000003` |
| parcel 12 | `a0000000-0000-4000-8000-000000000012` |
| party 2 | `30000000-0000-4000-8000-000000000002` |
| party 3 | `30000000-0000-4000-8000-000000000003` |
| transfer 3 | `90000000-0000-4000-8000-000000000003` |
| address 2 | `20000000-0000-4000-8000-000000000002` |

## 1. Parcel 2's pane

- [ ] "Primary condition" reads "Average".
- [ ] Improvement 2, under "Improvements" and "Primary improvement", opens its
      page.

## 2. Improvement 2

- [ ] The heading is "Improvement: Single family dwelling at 2 Fixture Way,
      Testville ZZ000".
- [ ] Condition "Average" and Quality "Fixture Standard", as plain text.
- [ ] The address opens address 2.
- [ ] Parcels lists parcel 2 with "Primary on parcel: Yes".
- [ ] Owners lists "Fixture Owner 2" and "Fixture Owner 3", each at `0.5000`,
      and each opens its party page.
- [ ] No market or assessed value is shown.

## 3. Improvement 16, from parcel 3's pane

- [ ] Parcel 3's "Improvements" lists improvement 16, and it opens its page.
- [ ] Parcels lists parcel 3 with "Primary on parcel: No".
- [ ] Owners lists one owner, "Fixture Owner 5". That isn't parcel 3's owner.
- [ ] "Full bathrooms" and "Bedrooms" show `0` (recorded zeros), and "Half
      bathrooms" shows `—` (not recorded).

## 4. Improvements 1 and 18

- [ ] Improvement 1's Owners section shows the note: "No owners are recorded
      on this improvement. Its parcels' owners are on each parcel's page."
- [ ] Improvement 18's "Condition", "Quality" and counts show `—`, and its
      Parcels section lists parcel 12.

## 5. Party pages

- [ ] Party 3's Improvements section, between Parcels and Transfers, lists
      improvement 2 at `0.5000`, then improvement 3 at `1.0000`, and each opens
      its page.
- [ ] Party 2's Improvements section lists improvement 2 only.

## 6. Links elsewhere

- [ ] Transfer 3's Improvements table links each improvement to its page.
- [ ] Address 2's "Improvements at this address" links improvement 2 to its
      page.

## 7. Not found

- [ ] `/improvements/<improvement 17>` (on a voided parcel) shows "No
      improvement with this ID."
- [ ] `/improvements/ffffffff-0000-4000-8000-000000000000` shows the same.
- [ ] `/improvements/not-a-uuid` shows it without an API call.

## 8. Back retraces every hop

- [ ] Go parcel 2 → improvement 2 → party 3 → improvement 3, then press Back
      three times: each page comes back in turn, ending on parcel 2.
