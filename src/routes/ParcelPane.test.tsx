import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'
import { renderApp } from '../test/appRouter.tsx'

// The map needs WebGL, which jsdom doesn't have; these tests are about the pane.
vi.mock('../map/ParcelMap.tsx', () => ({ ParcelMap: () => null }))

afterEach(cleanup)

const pane = () => within(screen.getByRole('region', { name: 'Parcel details' }))

describe('parcel pane', () => {
  test('shows the parcel, with every reference a link', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    expect(
      await pane().findByRole('heading', { name: 'Parcel: 2 Fixture Way, Testville ZZ000' }),
    ).toBeDefined()
    const href = (name: string) => pane().getByRole('link', { name }).getAttribute('href')
    expect(href('2 Fixture Way, Testville ZZ000')).toBe(`/addresses/${IDS.address}`)
    expect(href(IDS.partyA)).toBe(`/parties/${IDS.partyA}`)
    expect(href(IDS.partyB)).toBe(`/parties/${IDS.partyB}`)
    expect(href('Single family')).toBe(`/land-uses/${IDS.landUse}`)
    expect(href('Fixture Residential')).toBe(`/zoning/${IDS.zoning}`)
    // Feature and improvement IDs are plain text.
    expect(pane().getByText('1002')).toBeDefined()
    expect(pane().queryByRole('link', { name: IDS.improvement })).toBeNull()
  })

  test('a parcel ID not in the response: "No parcel with this ID."', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parcels/${IDS.missing}`, transport)
    expect(await pane().findByText('No parcel with this ID.')).toBeDefined()
  })

  test('a parcel with no geometry says so', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parcels/${IDS.parcelNoGeometry}`, transport)
    expect(await pane().findByText('This parcel has no map geometry.')).toBeDefined()
  })

  test('the loader starts the parcel and its extent together', async () => {
    const { transport, calls } = fakeCivilOs()
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    await pane().findByRole('heading', { name: /^Parcel:/ })
    const methods = calls.map((c) => c.method)
    expect(methods).toContain('getParcelsWithImprovementSummaryByParcelId')
    expect(methods).toContain('getParcelExtentsWGS84ByParcelId')
    expect(methods.filter((m) => m === 'getParcelsWithImprovementSummaryByParcelId')).toHaveLength(1)
  })
})

describe('transfers on the pane', () => {
  test('lists 25 at a time, and "More" fetches the next page', async () => {
    const { transport, calls } = fakeCivilOs({ transfers: 30 })
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    const rows = async () =>
      (await pane().findAllByRole('link', { name: /^90000000-/ })).length
    expect(await rows()).toBe(25)
    expect(pane().getByText('2023-11-14T22:13:20.000Z')).toBeDefined()
    fireEvent.click(pane().getByRole('button', { name: 'More' }))
    await waitFor(async () => expect(await rows()).toBe(30))
    expect(pane().queryByRole('button', { name: 'More' })).toBeNull()
    const requests = calls.filter((c) => c.method === 'getTransfersByParcelId')
    expect(requests.map((c) => (c.input as { after?: string }).after)).toEqual([undefined, '25'])
  })

  test('a failed "More" keeps the loaded rows and shows its error', async () => {
    const { transport } = fakeCivilOs({ transfers: 30, failNextTransfersPage: true })
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    expect(await pane().findAllByRole('link', { name: /^90000000-/ })).toHaveLength(25)
    fireEvent.click(pane().getByRole('button', { name: 'More' }))
    expect((await pane().findByRole('alert')).textContent).toBe('Unavailable: reader down')
    expect(pane().getAllByRole('link', { name: /^90000000-/ })).toHaveLength(25)
  })

  test('no transfers: "None."', async () => {
    const { transport } = fakeCivilOs({ transfers: 0 })
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    expect(await pane().findByText('None.')).toBeDefined()
  })
})
