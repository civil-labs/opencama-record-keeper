import { act, cleanup, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'

// Counts how often the map mounts. jsdom has no WebGL, so the real map can't run.
const mounts = vi.hoisted(() => ({ count: 0 }))
vi.mock('../map/ParcelMap.tsx', () => ({
  ParcelMap: function FakeMap() {
    useEffect(() => {
      mounts.count++
    }, [])
    return null
  },
}))

afterEach(cleanup)

test('the map stays mounted while the selection changes', async () => {
  const { transport } = fakeCivilOs()
  const { router } = await renderApp(`/parcels/${IDS.parcel}`, transport)
  const pane = () => within(screen.getByRole('region', { name: 'Parcel details' }))
  await pane().findByRole('heading', { name: /^Parcel:/ })

  await act(() =>
    router.navigate({ to: '/parcels/$parcelId', params: { parcelId: IDS.parcelNoGeometry } }),
  )
  await pane().findByText('This parcel has no map geometry.')
  await act(() => router.navigate({ to: '/parcels' }))
  expect(pane().queryByRole('heading')).toBeNull()

  expect(mounts.count).toBe(1)
})
