import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'

afterEach(cleanup)

const section = (name: string) =>
  within(screen.getByRole('heading', { name, level: 2 }).closest('section') as HTMLElement)
const valueOf = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling

describe('party page', () => {
  test('name, linked mailing address, parcels with shares, and transfers', async () => {
    const { transport, calls } = fakeCivilOs()
    await renderApp(`/parties/${IDS.partyA}`, transport)
    expect(await screen.findByRole('heading', { name: 'Party: Fixture Owner 2' })).toBeDefined()
    const mailing = within(valueOf('Mailing address') as HTMLElement).getByRole('link')
    expect(mailing.textContent).toBe('2 Fixture Way, Testville ZZ000')
    expect(mailing.getAttribute('href')).toBe(`/addresses/${IDS.address}`)

    const parcels = section('Parcels')
    const row = (await parcels.findByRole('link', { name: IDS.parcel })).closest('tr')
    expect(row?.textContent).toBe(`${IDS.parcel}0.5000`)
    expect(parcels.getAllByRole('row')).toHaveLength(3)

    const transfers = section('Transfers')
    expect(
      (await transfers.findByRole('link', { name: IDS.transfer(3) })).getAttribute('href'),
    ).toBe(`/transfers/${IDS.transfer(3)}`)
    const request = calls.find((c) => c.method === 'getTransfersByPartyId')
    expect((request?.input as { partyIds: string[] }).partyIds).toEqual([IDS.partyA])
  })

  test('a mailing address with no address record is plain text', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parties/${IDS.partyC}`, transport)
    await screen.findByRole('heading', { name: 'Party: Fixture Owner 4' })
    const mailing = valueOf('Mailing address')
    expect(mailing?.textContent).toBe('PO Box 4')
    expect(within(mailing as HTMLElement).queryByRole('link')).toBeNull()
  })

  test('an ID not in the response: "No party with this ID."', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parties/${IDS.missing}`, transport)
    expect(await screen.findByText('No party with this ID.')).toBeDefined()
  })
})
