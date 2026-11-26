import type { Improvement } from '@civil-labs/civil-os-api'
import { act, cleanup, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'
import { improvementLabel } from './ImprovementPage.tsx'

afterEach(cleanup)

const section = (name: string) =>
  within(screen.getByRole('heading', { name, level: 2 }).closest('section') as HTMLElement)
const valueOf = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling as HTMLElement

describe('improvementLabel', () => {
  const improvement = (formattedAddress?: string) =>
    ({ improvementId: IDS.improvement, typeId: IDS.improvementType, formattedAddress }) as Improvement
  const types = { [IDS.improvementType]: 'Single family dwelling' }

  test('type and address', () => {
    expect(improvementLabel(improvement('2 Fixture Way'), types)).toBe(
      'Single family dwelling at 2 Fixture Way',
    )
  })
  test('type alone', () => {
    expect(improvementLabel(improvement(), types)).toBe('Single family dwelling')
  })
  test('address alone, when the type is not known', () => {
    expect(improvementLabel(improvement('2 Fixture Way'), {})).toBe('2 Fixture Way')
  })
  test('neither: the ID', () => {
    expect(improvementLabel(improvement(''), {})).toBe(IDS.improvement)
  })
})

describe('improvement page', () => {
  test('every field in proto order, with lookups named and the address linked', async () => {
    const { transport, calls } = fakeCivilOs()
    await renderApp(`/improvements/${IDS.improvement}`, transport)
    expect(
      await screen.findByRole('heading', {
        name: 'Improvement: Single family dwelling at 2 Fixture Way, Testville ZZ000',
      }),
    ).toBeDefined()
    const labels = [...document.querySelectorAll('dt')].map((dt) => dt.textContent)
    expect(labels).toEqual([
      'Improvement ID',
      'Type',
      'Condition',
      'Quality',
      'Address',
      'Area (sq ft)',
      'Full bathrooms',
      'Half bathrooms',
      'Bathrooms',
      'Bedrooms',
      'Units',
      'Year built',
      'Effective year built',
      'Properties',
    ])
    await waitFor(() => expect(valueOf('Type').textContent).toBe('Single family dwelling'))
    expect(valueOf('Condition').textContent).toBe('Average')
    expect(valueOf('Quality').textContent).toBe('Fixture Standard')
    // The lookups have no pages, so their names are plain text.
    expect(within(valueOf('Type')).queryByRole('link')).toBeNull()
    const address = within(valueOf('Address')).getByRole('link')
    expect(address.textContent).toBe('2 Fixture Way, Testville ZZ000')
    expect(address.getAttribute('href')).toBe(`/addresses/${IDS.address}`)
    expect(valueOf('Area (sq ft)').textContent).toBe('1399.307')
    expect(valueOf('Half bathrooms').textContent).toBe('—')
    expect(valueOf('Bathrooms').textContent).toBe('2')
    expect(valueOf('Year built').textContent).toBe('1982')
    expect(valueOf('Properties').querySelector('pre')?.textContent).toBe('{\n  "stories": 2\n}')

    // No values, and no legal time: the current record only.
    const read = calls.find((c) => c.method === 'getImprovementsById')
    expect(read?.input).toMatchObject({ improvementIds: [IDS.improvement] })
    expect(read?.input).not.toHaveProperty('valuationId')
    expect(read?.input).not.toHaveProperty('legalAsOf')
    expect(screen.queryByText(/value/i, { selector: 'dt' })).toBeNull()
  })

  test('parcels, in the order returned, each with its primary flag', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/improvements/${IDS.improvementB}`, transport)
    const parcels = section('Parcels')
    expect(parcels.getByRole('columnheader', { name: 'Primary on parcel' })).toBeDefined()
    const rows = parcels.getAllByRole('row').slice(1)
    expect(rows.map((row) => row.textContent)).toEqual([`${IDS.parcel}No`, `${IDS.parcelB}Yes`])
    expect(within(rows[1] as HTMLElement).getByRole('link').getAttribute('href')).toBe(
      `/parcels/${IDS.parcelB}`,
    )
  })

  test('owners, named by one batched read', async () => {
    const { transport, calls } = fakeCivilOs()
    await renderApp(`/improvements/${IDS.improvement}`, transport)
    const owners = section('Owners')
    const first = await owners.findByRole('link', { name: 'Fixture Owner 2' })
    expect(first.getAttribute('href')).toBe(`/parties/${IDS.partyA}`)
    expect(first.closest('tr')?.textContent).toBe('Fixture Owner 20.5000')
    expect(owners.getByRole('link', { name: 'Fixture Owner 3' }).closest('tr')?.textContent).toBe(
      'Fixture Owner 30.5000',
    )
    const reads = calls.filter((c) => c.method === 'getPartiesById')
    expect(reads.map((c) => (c.input as { partyIds: string[] }).partyIds)).toEqual([
      [IDS.partyA, IDS.partyB],
    ])
  })

  test('a failed owner-names read keeps the IDs and shows its error in the section only', async () => {
    const { transport } = fakeCivilOs({ failPartiesById: true })
    await renderApp(`/improvements/${IDS.improvement}`, transport)
    const owners = section('Owners')
    expect((await owners.findByRole('alert')).textContent).toBe('Unavailable: reader down')
    expect(owners.getByRole('link', { name: IDS.partyA })).toBeDefined()
    expect(owners.getByRole('link', { name: IDS.partyB })).toBeDefined()
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(section('Parcels').getByRole('link', { name: IDS.parcel })).toBeDefined()
  })

  test('no owners: the note, and no party read', async () => {
    const { transport, calls } = fakeCivilOs()
    await renderApp(`/improvements/${IDS.improvementB}`, transport)
    expect(
      section('Owners').getByText(
        "No owners are recorded on this improvement. Its parcels' owners are on each parcel's page.",
      ),
    ).toBeDefined()
    expect(section('Owners').queryByRole('table')).toBeNull()
    // Let the page settle, so a request sent after render would be logged.
    await waitFor(() => expect(valueOf('Type').textContent).toBe('Single family dwelling'))
    await act(() => new Promise((resolve) => setTimeout(resolve, 20)))
    expect(calls.filter((c) => c.method === 'getPartiesById')).toEqual([])
  })

  test('unset shows "—" and a recorded 0 shows "0"', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/improvements/${IDS.improvementB}`, transport)
    expect(
      await screen.findByRole('heading', { name: 'Improvement: Single family dwelling' }),
    ).toBeDefined()
    expect(valueOf('Full bathrooms').textContent).toBe('0')
    for (const label of [
      'Half bathrooms',
      'Bathrooms',
      'Bedrooms',
      'Units',
      'Year built',
      'Effective year built',
      'Quality',
      'Address',
      'Area (sq ft)',
      'Properties',
    ]) {
      expect(valueOf(label).textContent, label).toBe('—')
    }
    // A condition no lookup knows shows its ID.
    await waitFor(() => expect(valueOf('Type').textContent).toBe('Single family dwelling'))
    expect(valueOf('Condition').textContent).toBe(IDS.unknownCondition)
  })

  test('failed lookups show the IDs, and the page still renders', async () => {
    const { transport } = fakeCivilOs({ failImprovementLookups: true })
    await renderApp(`/improvements/${IDS.improvement}`, transport)
    expect(
      await screen.findByRole('heading', {
        name: 'Improvement: 2 Fixture Way, Testville ZZ000',
      }),
    ).toBeDefined()
    expect(valueOf('Type').textContent).toBe(IDS.improvementType)
    expect(valueOf('Condition').textContent).toBe(IDS.improvementCondition)
    expect(valueOf('Quality').textContent).toBe(IDS.improvementQuality)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  test('an ID civil-os leaves out: "No improvement with this ID."', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/improvements/${IDS.missing}`, transport)
    expect(await screen.findByText('No improvement with this ID.')).toBeDefined()
  })
})
