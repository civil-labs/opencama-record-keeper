import { cleanup, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'
import { fakeCivilOs, IDS } from '../test/fixtures.ts'
import { formatCoordinates, nameAndCode } from './AddressPage.tsx'

afterEach(cleanup)

const section = (name: string) =>
  within(screen.getByRole('heading', { name, level: 2 }).closest('section') as HTMLElement)
const valueOf = (label: string) =>
  screen.getByText(label, { selector: 'dt' }).nextElementSibling?.textContent

describe('formatting', () => {
  test('nameAndCode', () => {
    expect(nameAndCode({ name: 'Fixture Province', code: 'ZZ-FX' })).toBe('Fixture Province (ZZ-FX)')
    expect(nameAndCode({ name: '', code: 'ZZ' })).toBe('ZZ')
    expect(nameAndCode({ name: 'Testland', code: '' })).toBe('Testland')
    expect(nameAndCode(undefined)).toBe('')
  })
  test('formatCoordinates: latitude first', () => {
    expect(formatCoordinates({ latitude: -39.9998, longitude: -139.9994 })).toBe(
      '-39.9998, -139.9994',
    )
    expect(formatCoordinates(undefined)).toBe('')
  })
})

describe('address page', () => {
  test('fields, then the parcels, improvements and parties that use it', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/addresses/${IDS.address}`, transport)
    expect(
      await screen.findByRole('heading', { name: 'Address: 2 Fixture Way, Testville ZZ000' }),
    ).toBeDefined()
    expect(valueOf('Administrative area')).toBe('Fixture Province (ZZ-FX)')
    expect(valueOf('Country')).toBe('Testland (ZZ)')
    expect(valueOf('Coordinates')).toBe('-39.9998, -139.9994')
    expect(valueOf('Address line 2')).toBe('—')

    const parcels = section('Parcels at this address')
    expect((await parcels.findByRole('link', { name: IDS.parcel })).getAttribute('href')).toBe(
      `/parcels/${IDS.parcel}`,
    )
    const improvements = section('Improvements at this address')
    expect(await improvements.findByRole('link', { name: IDS.parcel })).toBeDefined()
    expect(improvements.queryByRole('link', { name: IDS.improvement })).toBeNull()
    const parties = section('Parties using this as their mailing address')
    expect(
      (await parties.findByRole('link', { name: 'Fixture Owner 2' })).getAttribute('href'),
    ).toBe(`/parties/${IDS.partyA}`)
  })

  test('a failing section shows its error; the rest of the page stays', async () => {
    const { transport } = fakeCivilOs({ failPartiesByAddress: true })
    await renderApp(`/addresses/${IDS.address}`, transport)
    const parties = section('Parties using this as their mailing address')
    expect((await parties.findByRole('alert')).textContent).toBe('Unavailable: reader down')
    expect(await section('Parcels at this address').findByRole('link')).toBeDefined()
  })

  test('an ID not in the response: "No address with this ID."', async () => {
    const { transport } = fakeCivilOs()
    await renderApp(`/addresses/${IDS.missing}`, transport)
    expect(await screen.findByText('No address with this ID.')).toBeDefined()
  })
})
