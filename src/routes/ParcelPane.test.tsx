import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'
import { formatBathrooms } from './ParcelPane.tsx'
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
    // Feature IDs are plain text. Improvement IDs ("Improvements" and
    // "Primary improvement") link to their pages.
    expect(pane().getByText('1002')).toBeDefined()
    const improvementLinks = pane().getAllByRole('link', { name: IDS.improvement })
    expect(improvementLinks.map((link) => link.getAttribute('href'))).toEqual([
      `/improvements/${IDS.improvement}`,
      `/improvements/${IDS.improvement}`,
    ])
  })

  test('names the primary condition from the conditions lookup', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    expect(await pane().findByText('Average')).toBeDefined()
    expect(pane().queryByText(IDS.improvementCondition)).toBeNull()
  })

  test('a failed conditions lookup shows the condition ID, and the pane still renders', async () => {
    const { transport } = fakeCivilOs({ failImprovementLookups: true })
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    expect(await pane().findByText(IDS.improvementCondition)).toBeDefined()
    expect(pane().getByRole('heading', { name: 'Parcel: 2 Fixture Way, Testville ZZ000' })).toBeDefined()
    expect(pane().queryByRole('alert')).toBeNull()
  })

  test('shows bathrooms as full and half counts', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    expect(await pane().findByText('2 full, 1 half')).toBeDefined()
    expect(pane().queryByText('Total bathrooms')).toBeNull()
  })

  test('formatBathrooms', () => {
    expect(formatBathrooms(2, 1)).toBe('2 full, 1 half')
    expect(formatBathrooms(3, 0)).toBe('3 full')
    expect(formatBathrooms(0, 1)).toBe('1 half')
    expect(formatBathrooms(0, 0)).toBeUndefined()
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

describe('the neighborhood definition', () => {
  const neighborhood = () =>
    pane().getByText('Neighborhood').parentElement?.querySelector('dd')?.textContent

  test('changing it reads the parcel again under it, and nothing else', async () => {
    const { transport, calls } = fakeCivilOs({ transfers: 1, parcelDelayMs: 50 })
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    await pane().findByRole('link', { name: 'North Fixture' })
    await pane().findAllByRole('link', { name: /^90000000-/ })

    const select = pane().getByRole('combobox', { name: 'Neighborhood definition' })
    fireEvent.change(select, { target: { value: IDS.definitionB } })
    // The previous result stays, with only the neighborhood loading.
    expect(neighborhood()).toBe('Loading…')
    expect(pane().getByRole('heading', { name: /^Parcel:/ })).toBeDefined()
    // The parcel has no neighborhood under the other definition.
    await waitFor(() => expect(neighborhood()).toBe('—'))

    // Switching back is served from the cache.
    fireEvent.change(select, { target: { value: IDS.definitionA } })
    expect(await pane().findByRole('link', { name: 'North Fixture' })).toBeDefined()

    const reads = calls.filter((c) => c.method === 'getParcelsWithImprovementSummaryByParcelId')
    expect(
      reads.map((c) => (c.input as { neighborhoodDefinitionId?: string }).neighborhoodDefinitionId),
    ).toEqual([IDS.definitionA, IDS.definitionB])
    expect(calls.filter((c) => c.method === 'getTransfersByParcelId')).toHaveLength(1)
    expect(calls.filter((c) => c.method === 'getLandUses')).toHaveLength(1)
  })

  test('no definitions: the parcel is read with none', async () => {
    const { transport, calls } = fakeCivilOs({ definitions: 'none' })
    await renderApp(`/parcels/${IDS.parcel}`, transport)
    await pane().findByRole('heading', { name: /^Parcel:/ })
    expect(neighborhood()).toBe('—')
    const read = calls.find((c) => c.method === 'getParcelsWithImprovementSummaryByParcelId')
    expect(read).toBeDefined()
    expect((read?.input as { neighborhoodDefinitionId?: string }).neighborhoodDefinitionId).toBeUndefined()
  })
})
