import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'

afterEach(cleanup)

const section = (name: string) =>
  within(screen.getByRole('heading', { name, level: 2 }).closest('section') as HTMLElement)

describe('transfer page', () => {
  test('fields, recordings, codes, and who transferred what to whom', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/transfers/${IDS.transfer(3)}`, transport)
    expect(
      await screen.findByRole('heading', { name: 'Transfer: 2023-09-01T00:00:00.000Z' }),
    ).toBeDefined()
    expect(screen.getByText('520000.0000')).toBeDefined()

    // Only http(s) URIs are links.
    const recordings = section('Recordings')
    expect(recordings.getByRole('link').getAttribute('href')).toBe(
      'https://recordings.example.invalid/FX-3',
    )
    expect(recordings.getByText('javascript:alert(1)').tagName).toBe('TD')
    expect(section('Codes').getByText('Fixture Qualification')).toBeDefined()

    // A parcel's grantors and grantees, each named, with their shares.
    const parcelRow = section('Parcels').getByRole('link', { name: IDS.parcel }).closest('tr')!
    expect(parcelRow.textContent).toBe(
      `${IDS.parcel}Fixture Seller (1.0000)Fixture Buyer (0.5000), ${IDS.partyC} (0.5000)`,
    )
    expect(within(parcelRow).getByRole('link', { name: 'Fixture Buyer' }).getAttribute('href')).toBe(
      `/parties/${IDS.partyB}`,
    )

    // Improvement IDs link to their pages.
    const improvements = section('Improvements')
    expect(improvements.getByRole('link', { name: IDS.improvement }).getAttribute('href')).toBe(
      `/improvements/${IDS.improvement}`,
    )
    expect(improvements.getAllByRole('row')[1]?.textContent).toContain('—')

    // Parties, with their mailing address as of the transfer.
    const parties = section('Parties')
    expect(parties.getByRole('link', { name: 'Fixture Seller' }).closest('tr')?.textContent).toBe(
      'Fixture Seller1 Old Road',
    )
  })

  test('an ID not in the response: "No transfer with this ID."', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/transfers/${IDS.transfer(99)}`, transport)
    expect(await screen.findByText('No transfer with this ID.')).toBeDefined()
  })
})
