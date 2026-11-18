import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'

vi.mock('../map/ParcelMap.tsx', () => ({ ParcelMap: () => null }))

afterEach(cleanup)

const pane = () => within(screen.getByRole('region', { name: 'Parcel details' }))
const select = () =>
  pane().findByRole<HTMLSelectElement>('combobox', { name: 'Neighborhood definition' })

describe('neighborhood definition selector', () => {
  test('lists the definitions by name, with the first selected by default', async () => {
    const { transport } = fakeCivilOs()
    await renderApp('/parcels', transport)
    const options = within(await select()).getAllByRole('option')
    expect(options.map((o) => o.textContent)).toEqual(['Fixture districts', 'Fixture market areas'])
    expect((await select()).value).toBe(IDS.definitionA)
  })

  test('a choice is kept by the store', async () => {
    const { transport } = fakeCivilOs()
    const { router } = await renderApp('/parcels', transport)
    fireEvent.change(await select(), { target: { value: IDS.definitionB } })
    expect((await select()).value).toBe(IDS.definitionB)
    expect(router.options.context.definitionChoice?.get()).toBe(IDS.definitionB)
  })

  test('shows the error if the definitions fail to load', async () => {
    const { transport } = fakeCivilOs({ definitions: 'fail' })
    await renderApp('/parcels', transport)
    expect((await pane().findByRole('alert')).textContent).toBe('Unavailable: reader down')
    expect(pane().queryByRole('combobox')).toBeNull()
  })

  test('says so when there are none', async () => {
    const { transport } = fakeCivilOs({ definitions: 'none' })
    await renderApp('/parcels', transport)
    expect(await pane().findByText('No neighborhood definitions')).toBeDefined()
  })
})
