import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
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

describe("a party's improvements", () => {
  const links = (name: RegExp) => section('Improvements').queryAllByRole('link', { name })

  test('between Parcels and Transfers, 25 at a time, and "More" loads the rest', async () => {
    const { transport, calls } = fakeCivilOs()
    await renderApp(`/parties/${IDS.partyB}`, transport)
    await screen.findByRole('heading', { name: 'Party: Fixture Owner 3' })
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)
    expect(headings).toEqual(['Parcels', 'Improvements', 'Transfers'])

    await waitFor(() => expect(links(/^53000000-/)).toHaveLength(25))
    const first = section('Improvements').getByRole('link', { name: IDS.heldImprovement(1) })
    expect(first.getAttribute('href')).toBe(`/improvements/${IDS.heldImprovement(1)}`)
    expect(first.closest('tr')?.textContent).toBe(`${IDS.heldImprovement(1)}1.0000`)

    fireEvent.click(section('Improvements').getByRole('button', { name: 'More' }))
    await waitFor(() => expect(links(/^53000000-/)).toHaveLength(30))
    expect(section('Improvements').queryByRole('button', { name: 'More' })).toBeNull()
    const requests = calls.filter((c) => c.method === 'getImprovementsByPartyId')
    expect(requests.map((c) => c.input)).toEqual([
      expect.objectContaining({ partyId: IDS.partyB, first: 25 }),
      expect.objectContaining({ partyId: IDS.partyB, first: 25, after: '25' }),
    ])
  })

  test('none: the usual empty state', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parties/${IDS.partyA}`, transport)
    expect(await section('Improvements').findByText('None.')).toBeDefined()
  })

  test('a failed section shows its error; Parcels and Transfers stay', async () => {
    const { transport } = fakeCivilOs({ failImprovementsByParty: true })
    await renderApp(`/parties/${IDS.partyA}`, transport)
    expect((await section('Improvements').findByRole('alert')).textContent).toBe(
      'Unavailable: reader down',
    )
    expect(await section('Parcels').findByRole('link', { name: IDS.parcel })).toBeDefined()
    expect(await section('Transfers').findByRole('link', { name: IDS.transfer(3) })).toBeDefined()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
  })
})
