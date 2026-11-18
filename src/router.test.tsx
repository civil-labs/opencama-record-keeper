import { act, cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { parseUuid } from './router.tsx'
import { noCallsTransport, recordCalls, renderApp } from './test/appRouter.tsx'
import { fakeCivilOs, IDS } from './test/fixtures.ts'

afterEach(cleanup)

const ID = '2b0c7a52-9f0e-4c1e-8a57-3c3f1e6d9a10'

describe('parseUuid', () => {
  test('accepts a UUID and lowercases it', () => {
    expect(parseUuid(ID.toUpperCase())).toBe(ID)
  })
  test.each(['', 'abc', `${ID}x`, ID.replace(/-/g, '')])('rejects %j', (value) => {
    expect(() => parseUuid(value)).toThrow()
  })
})

describe('routes', () => {
  test('/ redirects to /parcels, replacing the history entry', async () => {
    const { router, history } = await renderApp('/')
    expect(router.state.location.pathname).toBe('/parcels')
    expect(history.length).toBe(1)
  })

  test('/parcels/not-a-uuid says so in the pane, without an API call', async () => {
    const { transport, calls } = noCallsTransport()
    await renderApp('/parcels/not-a-uuid', transport)
    expect(await screen.findByText('No parcel with this ID.')).toBeDefined()
    expect(screen.getByRole('region', { name: 'Parcel details' })).toBeDefined()
    expect(recordCalls(calls)).toEqual([])
  })

  test.each([
    ['/addresses/not-a-uuid', 'No address with this ID.'],
    ['/parties/not-a-uuid', 'No party with this ID.'],
    ['/transfers/not-a-uuid', 'No transfer with this ID.'],
    ['/land-uses/not-a-uuid', 'Not found'],
    ['/zoning/not-a-uuid', 'Not found'],
    ['/neighborhoods/not-a-uuid', 'Not found'],
  ])('%s says "%s" without an API call', async (path, message) => {
    const { transport, calls } = noCallsTransport()
    await renderApp(path, transport)
    expect(await screen.findByText(message)).toBeDefined()
    expect(screen.getByRole('navigation')).toBeDefined()
    expect(recordCalls(calls)).toEqual([])
  })

  test('an unknown path shows "Not found" under the navbar', async () => {
    await renderApp('/no/such/page')
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeDefined()
    expect(screen.getByRole('navigation')).toBeDefined()
  })
})

test('the neighborhood definitions load once, on app load, and stay cached', async () => {
  const { transport, calls } = fakeCivilOs()
  const { router } = await renderApp('/no/such/page', transport)
  await act(() => router.navigate({ to: '/addresses/$addressId', params: { addressId: IDS.address } }))
  await act(() => router.navigate({ to: '/$', params: { _splat: 'no/such/page' } }))
  expect(calls.filter((c) => c.method === 'getNeighborhoodDefinitions')).toHaveLength(1)
})
