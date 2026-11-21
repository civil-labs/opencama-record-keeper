// Plan, PR 2 step 5: the address search query, against the fake Civil OS.
import { ParcelsService } from '@civil-labs/civil-os-api'
import { Code, createRouterTransport, type Transport } from '@connectrpc/connect'
import { TransportProvider } from '@connectrpc/connect-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, test } from 'vitest'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'
import { SEARCH_PAGE_SIZE, useAddressSearch, type AddressSearchState } from './search.ts'

function renderSearch(transport: Transport, initial = '') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </TransportProvider>
  )
  return renderHook(({ raw }) => useAddressSearch(raw), {
    wrapper,
    initialProps: { raw: initial },
  })
}

function searches(log: { method: string; input: unknown }[]) {
  return log
    .filter((call) => call.method === 'searchParcelsAddresses')
    .map((call) => call.input as { query: string; first?: number; legalAsOf?: unknown })
}

const results = (state: AddressSearchState) => {
  if (state.status !== 'results') throw new Error(`status is ${state.status}`)
  return state
}

describe('useAddressSearch', () => {
  test('one call per burst of typing, with the text as typed and first: 10', async () => {
    const civil = fakeCivilOs()
    const { result, rerender } = renderSearch(civil.transport)
    for (const raw of ['fix', 'fixt', 'fixtu', 'Fixture, Way']) rerender({ raw })

    await waitFor(() => expect(result.current.status).toBe('results'))
    const calls = searches(civil.calls)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ query: 'Fixture, Way', first: SEARCH_PAGE_SIZE })
    expect(calls[0]?.legalAsOf).toBeUndefined()

    const state = results(result.current)
    expect(state.hits).toHaveLength(10)
    expect(state.hits[0]?.parcelId).toBe(IDS.parcel)
    expect(state.hasNextPage).toBe(true)
    expect(state.stale).toBe(false)
  })

  test('the last page has no next page; no hits is an empty page', async () => {
    const civil = fakeCivilOs()
    const { result, rerender } = renderSearch(civil.transport, 'shared court')
    await waitFor(() => expect(result.current.status).toBe('results'))
    expect(results(result.current).hits.map((h) => h.parcelId)).toEqual([IDS.sharedA, IDS.sharedB])
    expect(results(result.current).hasNextPage).toBe(false)

    rerender({ raw: 'no such street' })
    await waitFor(() => expect(results(result.current).stale).toBe(false))
    expect(results(result.current).hits).toEqual([])
  })

  test('empty and too-short text: no call', async () => {
    const civil = fakeCivilOs()
    const { result, rerender } = renderSearch(civil.transport)
    expect(result.current.status).toBe('empty')
    for (const raw of ['1', '12', '1-2', '  ab ', '!!!']) {
      rerender({ raw })
      expect(result.current.status).toBe('tooShort')
    }
    await new Promise((r) => setTimeout(r, 400))
    expect(searches(civil.calls)).toEqual([])
  })

  test('while the next text loads, the previous hits stay, stale', async () => {
    const civil = fakeCivilOs({ searchDelayMs: (q) => (q === 'shared court' ? 300 : 0) })
    const { result, rerender } = renderSearch(civil.transport, 'fixture way')
    await waitFor(() => expect(result.current.status).toBe('results'))

    rerender({ raw: 'shared court' })
    // Straight away (still debouncing) and while the request is in flight.
    expect(results(result.current)).toMatchObject({ stale: true })
    expect(results(result.current).hits[0]?.parcelId).toBe(IDS.parcel)
    await waitFor(() => expect(searches(civil.calls)).toHaveLength(2))
    expect(results(result.current)).toMatchObject({ stale: true })

    await waitFor(() => expect(results(result.current).stale).toBe(false))
    expect(results(result.current).hits[0]?.parcelId).toBe(IDS.sharedA)
  })

  test('the first search for a text, with nothing to show yet', async () => {
    const civil = fakeCivilOs({ searchDelayMs: 200 })
    const { result } = renderSearch(civil.transport, 'fixture way')
    expect(result.current.status).toBe('searching')
    await waitFor(() => expect(result.current.status).toBe('results'))
  })

  test('a slow response for older text never replaces a newer one', async () => {
    const civil = fakeCivilOs({ searchDelayMs: (q) => (q === 'fixture' ? 600 : 0) })
    const { result, rerender } = renderSearch(civil.transport, 'fixture')
    await waitFor(() => expect(searches(civil.calls)).toHaveLength(1))
    rerender({ raw: 'shared court' })
    await waitFor(() => expect(result.current).toMatchObject({ status: 'results', stale: false }))
    expect(results(result.current).hits[0]?.parcelId).toBe(IDS.sharedA)

    await new Promise((r) => setTimeout(r, 700))
    expect(results(result.current).hits[0]?.parcelId).toBe(IDS.sharedA)
  })

  test("a superseded request's AbortSignal fires", async () => {
    const signals: Record<string, AbortSignal> = {}
    const transport = createRouterTransport(({ service }) => {
      service(ParcelsService, {
        searchParcelsAddresses: async (req, context) => {
          signals[req.query] = context.signal
          if (req.query === 'fixture') {
            // Never answers unless aborted.
            await new Promise((_, reject) =>
              context.signal.addEventListener('abort', () => reject(new Error('aborted'))),
            )
          }
          return { hits: [], pageInfo: { hasNextPage: false } }
        },
      })
    })
    const { result, rerender } = renderSearch(transport, 'fixture')
    await waitFor(() => expect(signals.fixture).toBeDefined())
    expect(signals.fixture?.aborted).toBe(false)

    rerender({ raw: 'shared court' })
    await waitFor(() => expect(result.current).toMatchObject({ status: 'results', stale: false }))
    // The handler for 'fixture' only settles when aborted, so this is the
    // cancellation. (The router transport also aborts a finished call's
    // signal, so the newer call's signal can't be checked the same way.)
    expect(signals.fixture?.aborted).toBe(true)
  })

  test('a failed search is an error once settled', async () => {
    const civil = fakeCivilOs({ failSearch: Code.Unavailable })
    const { result } = renderSearch(civil.transport, 'fixture way')
    await waitFor(() => expect(result.current.status).toBe('error'))
    if (result.current.status !== 'error') throw new Error('unreachable')
    expect(result.current.error.code).toBe(Code.Unavailable)
  })
})
