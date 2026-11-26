# Record Keeper MVP: smoke checklist

This checklist walks each success criterion in [intent.md](intent.md) against the
civil-os local stack and its synthetic data. Run it before calling a change to the MVP
done. Every ID below comes from the civil-os fixtures (`internal/testutil/fixtures.go`
and the header of `database/fixtures/synthetic.sql`).

## Setup

1. In civil-os (v0.7.1 or later), start from a clean stack: `mise run down`, then
   `mise run up`.
2. Here, run `npm ci`, then `npm run dev`, and open <http://localhost:3000>.
   **Or, to check an image** instead of the dev server, run it on port 3000:
   `docker run --rm -p 3000:8080 ghcr.io/civil-labs/opencama-record-keeper:<tag>`.
   Its built-in `config.json` points at the local stack. Every section applies, and
   section 10 is then the image's own policy, not `npm run preview`'s.
3. Sign in as `dev@example.com` with password `civil-os-dev-password`. This is the
   local Dex's throwaway user, documented in civil-os `dev/dex.yaml`.

Short IDs below are the last digits of the fixture UUIDs:

| Short ID | Full ID |
|---|---|
| parcel 2 | `a0000000-0000-4000-8000-000000000002` |
| party 3 | `30000000-0000-4000-8000-000000000003` |
| transfer 3 | `90000000-0000-4000-8000-000000000003` |
| address 2 | `20000000-0000-4000-8000-000000000002` |

The fixtures sit in open ocean, so the basemap shows only water under the parcels.
That's expected.

## 1. Start view

- [ ] `/` redirects to `/parcels`.
- [ ] The map shows the whole instance: all 19 parcel squares, with a gap at the top
      right, and none cut off.
- [ ] The pane shows only the "Neighborhood definition" selector.

## 2. Selecting a parcel

- [ ] Clicking a parcel puts `/parcels/<id>` in the URL and fills the pane.
- [ ] The parcel is highlighted orange and centered on the map.
- [ ] Clicking empty map changes nothing. Clicking the selected parcel again changes
      nothing either.
- [ ] Opening `/parcels/<parcel 2>` directly shows the same details, with parcel 2
      highlighted and centered. It sits on the instance's bottom edge.
- [ ] Back to `/parcels` removes the highlight, and the camera stays put.

## 3. One click per hop

From parcel 2's pane, each of these is one click:

- [ ] **Address:** "2 Fixture Way, Testville ZZ000" opens address 2.
- [ ] **Parties:** each of parties 2 and 3 opens its party page.
- [ ] **Land use:** "Retail" opens its page.
- [ ] **Zoning:** "Fixture Residential" opens its page.
- [ ] **Neighborhood:** "North Fixture", under "Fixture districts", opens its page.
- [ ] **Transfer:** transfer 2, in the Transfers section, opens its page.

From transfer 3:

- [ ] Each parcel (6 and 7) opens its parcel page.
- [ ] Each party opens its party page: the grantor and grantees in the Parcels table,
      and every row of the Parties table.
- [ ] Improvement IDs open their improvement pages ([`../improvement-page/smoke.md`](../improvement-page/smoke.md)).

## 4. Neighborhood definition

On parcel 2:

- [ ] Choose "Fixture market areas". The Neighborhood field shows "Loading…", then
      "Fixture Market Area". The rest of the pane and the map don't change.
- [ ] Go to a transfer and press Back: "Fixture market areas" is still selected.
- [ ] Reload: still selected.
- [ ] Open the app in a new tab: still selected there.
- [ ] Choose "Fixture districts" in the new tab: the first tab follows, and shows
      "North Fixture".

## 5. Back retraces every hop

- [ ] Go parcel 2 → party 3 → parcel 3 (from party 3's Parcels table) → address 3.
      Press Back four times: each press returns to the previous page, ending on parcel
      2, with the map selection following.

## 6. Reload and shared links

- [ ] Reloading any record page shows the same record.
- [ ] Copy a record URL, sign out, and open the URL. After signing in, the app returns
      to that record.

## 7. Errors are shown

- [ ] **Not found:** an ID that doesn't exist says so. Edit one digit of a URL's UUID:
      "No parcel with this ID." in the pane, "No address with this ID.",
      "No party with this ID." or "No transfer with this ID.".
- [ ] **Malformed IDs:** the same messages for `/parcels/not-a-uuid` and the others.
      `/land-uses/not-a-uuid` shows "Not found". An unknown path shows "Not found"
      under the navbar.
- [ ] **A failed request:** in civil-os, run `docker compose stop database-reader`,
      then open a parcel or record page not yet viewed. The page shows
      `Unavailable: …` with a Retry button. Run `docker compose start database-reader`
      and press Retry: the record loads.
- [ ] **Voided and geometry-less parcels:** parcels 20 (voided) and 21 (no geometry)
      say "No parcel with this ID.". Parcel reads leave both out.

## 8. Address and party pages

- [ ] **Address 2:** "Fixture Province (ZZ-FX)" and "Testland (ZZ)", coordinates
      "-39.9998, -139.9994". It's linked from parcel 2, improvement 2 (with a link to
      its parcel), and party 2's mailing address.
- [ ] **Party 3:** parcels 2, 3 and 13, at shares 0.5000, 1.0000 and 1.0000. Its
      mailing address links to address 3. Its transfers, newest first, are transfer 2
      (2022-06-15, as grantee) and transfer 7 (2022-01-15, as grantor).
- [ ] **Neighborhoods:** parcels have a neighborhood under both definitions, as in
      section 4.

## 9. Session

These settle the spec's Dex questions, first confirmed in PR 2 (#4).

- [ ] Dex gives the public client `record-keeper-dev` a refresh token
      (`offline_access`).
- [ ] A refresh returns a new `id_token` and a rotated refresh token. To check it
      without waiting, add `expiry: { idTokens: 2m }` to civil-os `dev/dex.yaml` as a
      local, uncommitted change, then recreate Dex with
      `docker compose up -d --force-recreate dex`. The app renews before expiry with
      no redirect. Revert the change afterwards.
- [ ] Two tabs share the session. Signing out in one sends both to Dex's login.

## 10. Production build

- [ ] Run `npm run build`, then `npm run preview`. You need port 3000, so stop
      `npm run dev` first. Preview serves `dist/` with the image's policy:
      `script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self';
      frame-ancestors 'none'; form-action 'none'`. (Checking an image, skip this
      step: the image sends the same policy.)
- [ ] Sign in, select a parcel, and open a transfer. The browser console shows no
      CSP violations, and the map and pages work as in dev.

**Scripted runs.** Headless Firefox driven over WebDriver BiDi (for example by
`puppeteer-core` with `browser: 'firefox'`) reports CSP violations to the script as
page errors. A stronger check adds `report-uri` to the policy and collects the reports,
with a control page that's known to violate it, so a run that collects nothing is
proven able to collect. Older automation that doesn't use BiDi may not see CSP
warnings at all.
