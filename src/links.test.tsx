import { cleanup, screen } from '@testing-library/react'
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router'
import { act, render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import {
  featureIdToBigInt,
  featureIdToNumber,
  hasRoute,
  RecordLink,
  type RecordType,
} from './links.tsx'

afterEach(cleanup)

const ID = '2b0c7a52-9f0e-4c1e-8a57-3c3f1e6d9a10'

/** Renders inside a router so <Link> can build hrefs. */
async function renderWithRouter(node: ReactNode) {
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(() => router.load())
  render(<RouterProvider router={router} />)
}

describe('RecordLink', () => {
  test.each<[RecordType, string]>([
    ['parcel', `/parcels/${ID}`],
    ['address', `/addresses/${ID}`],
    ['party', `/parties/${ID}`],
    ['transfer', `/transfers/${ID}`],
    ['landUse', `/land-uses/${ID}`],
    ['zoning', `/zoning/${ID}`],
    ['neighborhood', `/neighborhoods/${ID}`],
    ['improvement', `/improvements/${ID}`],
  ])('%s links to %s', async (type, href) => {
    await renderWithRouter(<RecordLink type={type} id={ID} />)
    expect(screen.getByRole('link', { name: ID }).getAttribute('href')).toBe(href)
  })

  test.each<RecordType>([
    'improvementType',
    'improvementCondition',
    'improvementQuality',
    'landUseType',
    'neighborhoodDefinition',
  ])('%s has no route and renders plain text', async (type) => {
    expect(hasRoute(type)).toBe(false)
    await renderWithRouter(<RecordLink type={type} id={ID} label="Label" />)
    expect(screen.getByText('Label')).toBeDefined()
    expect(screen.queryByRole('link')).toBeNull()
  })

  test('uses the label when known, else the ID', async () => {
    await renderWithRouter(
      <>
        <RecordLink type="landUse" id={ID} label="Residential" />
        <RecordLink type="zoning" id={ID} label="" />
      </>,
    )
    expect(screen.getByRole('link', { name: 'Residential' })).toBeDefined()
    expect(screen.getByRole('link', { name: ID })).toBeDefined()
  })
})

describe('feature IDs', () => {
  test('round-trip between number and bigint', () => {
    for (const id of [0, 1, 123456789, Number.MAX_SAFE_INTEGER]) {
      expect(featureIdToNumber(featureIdToBigInt(id))).toBe(id)
    }
  })
  test.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects number %s',
    (id) => {
      expect(() => featureIdToBigInt(id)).toThrow(RangeError)
    },
  )
  test.each([-1n, BigInt(Number.MAX_SAFE_INTEGER) + 1n])('rejects bigint %s', (id) => {
    expect(() => featureIdToNumber(id)).toThrow(RangeError)
  })
})
