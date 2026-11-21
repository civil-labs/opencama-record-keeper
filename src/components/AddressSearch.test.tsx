// Plan, PR 2 step 6: the navbar's address search, against the fake Civil OS
// under a memory-history router. These tests pin the spec's keyboard table
// and popup states, so a Downshift upgrade that changes a default fails here.
import { Code, type Transport } from '@connectrpc/connect'
import { TransportProvider } from '@connectrpc/connect-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { User } from 'oidc-client-ts'
import { afterEach, describe, expect, test } from 'vitest'
import { RecentPicks, STORAGE_KEY_PREFIX, type PicksStorage } from '../search/recentPicks.ts'
import { fakeCivilOs, IDS, SEARCH_HITS } from '../test/fixtures.ts'
import { AddressSearch, HINT, MORE_MATCHES, NO_MATCHES, SEARCHING } from './AddressSearch.tsx'

afterEach(cleanup)

const KEY = `${STORAGE_KEY_PREFIX}user-a`

function memoryStorage(initial: Record<string, string> = {}): PicksStorage & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

const user = { profile: { sub: 'user-a' } } as unknown as User
const signedIn = { subscribe: () => () => {}, getUser: () => user }

async function renderSearch(
  options: { transport?: Transport; storage?: PicksStorage } = {},
) {
  const civil = fakeCivilOs()
  const transport = options.transport ?? civil.transport
  const storage = options.storage ?? memoryStorage()
  const recentPicks = new RecentPicks(storage, signedIn)
  const rootRoute = createRootRoute({
    component: () => (
      <>
        <AddressSearch recentPicks={recentPicks} />
        <Outlet />
      </>
    ),
  })
  const parcels = createRoute({ getParentRoute: () => rootRoute, path: 'parcels' })
  const parcel = createRoute({ getParentRoute: () => parcels, path: '$parcelId' })
  const history = createMemoryHistory({ initialEntries: ['/parcels'] })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parcels.addChildren([parcel])]),
    history,
  })
  await act(() => router.load())
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TransportProvider>,
  )
  const input = await screen.findByRole<HTMLInputElement>('combobox', { name: 'Search addresses' })
  return { input, history, recentPicks, storage, calls: civil.calls }
}

const searchCalls = (calls: { method: string }[]) =>
  calls.filter((c) => c.method === 'searchParcelsAddresses')

const type = (input: HTMLElement, value: string) => fireEvent.change(input, { target: { value } })
const key = (input: HTMLElement, k: string) => fireEvent.keyDown(input, { key: k })
const optionTexts = () => screen.queryAllByRole('option').map((o) => o.textContent)
const status = () => screen.getByRole('status').textContent
/** The popup's visible "Searching…" line, not the live region's copy. */
const searchingLine = () => screen.queryByText(SEARCHING, { selector: 'p' })

async function typeAndWait(input: HTMLElement, value: string) {
  act(() => input.focus())
  type(input, value)
  await waitFor(() => expect(searchingLine()).toBeNull())
  await screen.findAllByRole('option')
}

describe('markup', () => {
  test('a labelled combobox controlling a listbox, closed at first', async () => {
    const { input } = await renderSearch()
    expect(input.getAttribute('type')).toBe('search')
    expect(input.getAttribute('placeholder')).toBe('Search addresses')
    expect(input.getAttribute('maxlength')).toBe('200')
    expect(input.getAttribute('aria-autocomplete')).toBe('list')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    const listbox = screen.getByRole('listbox', { hidden: true })
    expect(input.getAttribute('aria-controls')).toBe(listbox.id)
  })
})

describe('what the popup shows', () => {
  test('empty input, nothing stored: stays closed on focus', async () => {
    const { input } = await renderSearch()
    act(() => input.focus())
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(optionTexts()).toEqual([])
  })

  test('fewer than 3 letters or digits: the hint, and no call', async () => {
    const { input, calls } = await renderSearch()
    act(() => input.focus())
    type(input, '1-2')
    expect(screen.getByText(HINT)).toBeDefined()
    expect(input.getAttribute('aria-expanded')).toBe('true')
    await new Promise((r) => setTimeout(r, 350))
    expect(searchCalls(calls)).toEqual([])
  })

  test('hits in order, with the footer when there are more', async () => {
    const { input } = await renderSearch()
    act(() => input.focus())
    type(input, 'fixture way')
    expect(searchingLine()).not.toBeNull()
    await typeAndWait(input, 'fixture way')
    expect(optionTexts()).toEqual(SEARCH_HITS.slice(0, 10).map((h) => h.formattedAddress))
    expect(screen.getByText(MORE_MATCHES)).toBeDefined()
    expect(status()).toBe('10 results, more available')
  })

  test('two parcels sharing an address both appear, and no footer on the last page', async () => {
    const { input } = await renderSearch()
    await typeAndWait(input, 'shared court')
    expect(optionTexts()).toEqual([
      '7 Shared Court, Testville ZZ000',
      '7 Shared Court, Testville ZZ000',
    ])
    expect(screen.queryByText(MORE_MATCHES)).toBeNull()
    expect(status()).toBe('2 results')
  })

  test('no hits', async () => {
    const { input } = await renderSearch()
    act(() => input.focus())
    type(input, 'no such street')
    expect(await screen.findByText(NO_MATCHES)).toBeDefined()
    expect(status()).toBe('No parcels match')
  })

  test('while the next text loads, the earlier hits stay with "Searching…"', async () => {
    const civil = fakeCivilOs({ searchDelayMs: (q) => (q === 'shared court' ? 400 : 0) })
    const { input } = await renderSearch({ transport: civil.transport })
    await typeAndWait(input, 'fixture way')
    type(input, 'shared court')
    expect(optionTexts()).toHaveLength(10)
    expect(searchingLine()).not.toBeNull()
    expect(status()).toBe(SEARCHING)
    await waitFor(() => expect(optionTexts()).toHaveLength(2))
    expect(searchingLine()).toBeNull()
  })

  test('a failed search shows one alert line in the popup', async () => {
    const civil = fakeCivilOs({ failSearch: Code.Unavailable })
    const { input } = await renderSearch({ transport: civil.transport })
    act(() => input.focus())
    type(input, 'fixture way')
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('Search failed: Unavailable. search failed')
    expect(optionTexts()).toEqual([])
  })
})

describe('keyboard', () => {
  test('no option is active when the popup opens; ↓/↑ move and wrap', async () => {
    const { input } = await renderSearch()
    await typeAndWait(input, 'shared court')
    const [first, second] = screen.getAllByRole('option')
    expect(input.getAttribute('aria-activedescendant')).toBeFalsy()

    key(input, 'ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBe(first?.id)
    expect(first?.getAttribute('aria-selected')).toBe('true')
    key(input, 'ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBe(second?.id)
    key(input, 'ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBe(first?.id)
    key(input, 'ArrowUp')
    expect(input.getAttribute('aria-activedescendant')).toBe(second?.id)
  })

  test('Enter picks the active option: navigate, clear, blur, record', async () => {
    const { input, history, recentPicks } = await renderSearch()
    await typeAndWait(input, 'shared court')
    key(input, 'ArrowDown')
    key(input, 'ArrowDown')
    key(input, 'Enter')
    await waitFor(() => expect(history.location.pathname).toBe(`/parcels/${IDS.sharedB}`))
    expect(input.value).toBe('')
    expect(document.activeElement).not.toBe(input)
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(recentPicks.get()).toEqual([
      { parcelId: IDS.sharedB, formattedAddress: '7 Shared Court, Testville ZZ000' },
    ])
  })

  test('Enter with no active option does nothing', async () => {
    const { input, history } = await renderSearch()
    await typeAndWait(input, 'shared court')
    key(input, 'Enter')
    expect(history.location.pathname).toBe('/parcels')
    expect(input.value).toBe('shared court')
    expect(optionTexts()).toHaveLength(2)
  })

  test('Escape closes; Escape again clears', async () => {
    const { input } = await renderSearch()
    await typeAndWait(input, 'shared court')
    key(input, 'Escape')
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(optionTexts()).toEqual([])
    expect(input.value).toBe('shared court')
    key(input, 'Escape')
    expect(input.value).toBe('')
  })

  test('Tab closes and never picks, even with an option active', async () => {
    const { input, history, recentPicks } = await renderSearch()
    await typeAndWait(input, 'shared court')
    key(input, 'ArrowDown')
    key(input, 'Tab')
    act(() => input.blur())
    expect(input.getAttribute('aria-expanded')).toBe('false')
    expect(input.value).toBe('shared court')
    expect(history.location.pathname).toBe('/parcels')
    expect(recentPicks.get()).toEqual([])
  })

  test('a highlight on earlier hits is dropped when a shorter list arrives', async () => {
    const civil = fakeCivilOs({ searchDelayMs: (q) => (q === 'shared court' ? 400 : 0) })
    const { input, history } = await renderSearch({ transport: civil.transport })
    await typeAndWait(input, 'fixture way')
    type(input, 'shared court')
    for (let i = 0; i < 8; i++) key(input, 'ArrowDown')
    expect(input.getAttribute('aria-activedescendant')).toBeTruthy()

    await waitFor(() => expect(optionTexts()).toHaveLength(2))
    expect(input.getAttribute('aria-activedescendant')).toBeFalsy()
    // Enter now does nothing: no pick, the text stays.
    key(input, 'Enter')
    expect(history.location.pathname).toBe('/parcels')
    expect(input.value).toBe('shared court')
    expect(optionTexts()).toHaveLength(2)
  })

  test('a highlight on earlier hits is dropped when a same-length list arrives', async () => {
    const civil = fakeCivilOs({ searchDelayMs: (q) => (q === '1 fixture way' ? 400 : 0) })
    const { input, history } = await renderSearch({ transport: civil.transport })
    await typeAndWait(input, 'shared court')
    type(input, '1 fixture way')
    key(input, 'ArrowDown')
    // 11 and 21 Fixture Way: as many hits as before, different parcels.
    await waitFor(() => expect(optionTexts()[0]).toBe('11 Fixture Way, Testville ZZ000'))
    expect(optionTexts()).toHaveLength(2)
    expect(input.getAttribute('aria-activedescendant')).toBeFalsy()
    // Enter mustn't pick a parcel that was never shown highlighted.
    key(input, 'Enter')
    expect(history.location.pathname).toBe('/parcels')
  })

  test('↓ on a closed popup opens it', async () => {
    const { input } = await renderSearch()
    await typeAndWait(input, 'shared court')
    key(input, 'Escape')
    key(input, 'ArrowDown')
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(optionTexts()).toHaveLength(2)
  })
})

describe('mouse', () => {
  test('a click picks, though the input blurs first', async () => {
    const { input, history } = await renderSearch()
    await typeAndWait(input, 'shared court')
    const [first] = screen.getAllByRole('option')
    if (!first) throw new Error('no option')
    // The browser's order: mousedown, the input's blur, mouseup, click.
    fireEvent.mouseDown(first)
    act(() => input.blur())
    fireEvent.mouseUp(first)
    fireEvent.click(first)
    await waitFor(() => expect(history.location.pathname).toBe(`/parcels/${IDS.sharedA}`))
    expect(input.value).toBe('')
  })

  test('picking the same parcel twice navigates both times', async () => {
    const { input, history } = await renderSearch()
    for (let pick = 1; pick <= 2; pick++) {
      await typeAndWait(input, 'shared court')
      const [first] = screen.getAllByRole('option')
      if (!first) throw new Error('no option')
      fireEvent.click(first)
      await waitFor(() => expect(history.location.pathname).toBe(`/parcels/${IDS.sharedA}`))
      // Leave, so the second pick has somewhere to navigate from.
      act(() => history.push('/parcels'))
      await waitFor(() => expect(history.location.pathname).toBe('/parcels'))
    }
  })
})

describe('recent picks', () => {
  test('focusing an empty box lists them; picking one makes no call', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify([
        { parcelId: IDS.sharedB, formattedAddress: '7 Shared Court, Testville ZZ000' },
        { parcelId: IDS.parcel, formattedAddress: '2 Fixture Way, Testville ZZ000' },
      ]),
    })
    const { input, history, calls, recentPicks } = await renderSearch({ storage })
    act(() => input.focus())
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Recent')).toBeDefined()
    expect(optionTexts()).toEqual([
      '7 Shared Court, Testville ZZ000',
      '2 Fixture Way, Testville ZZ000',
    ])

    key(input, 'ArrowDown')
    key(input, 'ArrowDown')
    key(input, 'Enter')
    await waitFor(() => expect(history.location.pathname).toBe(`/parcels/${IDS.parcel}`))
    expect(searchCalls(calls)).toEqual([])
    expect(recentPicks.get()[0]?.parcelId).toBe(IDS.parcel)
  })

  test('clicking into the unfocused box opens them and they stay', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify([{ parcelId: IDS.parcel, formattedAddress: '2 Fixture Way' }]),
    })
    const { input } = await renderSearch({ storage })
    // The browser's order for a click on an unfocused input: focus, then click.
    act(() => input.focus())
    fireEvent.click(input)
    expect(input.getAttribute('aria-expanded')).toBe('true')
    expect(optionTexts()).toEqual(['2 Fixture Way'])
    // Clicking the focused box again keeps it open.
    fireEvent.click(input)
    expect(optionTexts()).toEqual(['2 Fixture Way'])
  })

  test('clicking into the box with text in it reopens the hits', async () => {
    const { input } = await renderSearch()
    await typeAndWait(input, 'shared court')
    act(() => input.blur())
    expect(optionTexts()).toEqual([])
    act(() => input.focus())
    fireEvent.click(input)
    expect(optionTexts()).toHaveLength(2)
  })

  test('typing replaces them with the hint or hits', async () => {
    const storage = memoryStorage({
      [KEY]: JSON.stringify([{ parcelId: IDS.parcel, formattedAddress: '2 Fixture Way' }]),
    })
    const { input } = await renderSearch({ storage })
    act(() => input.focus())
    type(input, 'ab')
    expect(screen.queryByText('Recent')).toBeNull()
    expect(optionTexts()).toEqual([])
    expect(screen.getByText(HINT)).toBeDefined()
  })
})
