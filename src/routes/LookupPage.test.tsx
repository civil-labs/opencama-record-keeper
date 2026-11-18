import {
  LandUsesService,
  NeighborhoodService,
  ZoningService,
} from '@civil-labs/civil-os-api'
import { createRouterTransport } from '@connectrpc/connect'
import { cleanup, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'
import { renderApp } from '../test/appRouter.tsx'

afterEach(cleanup)

const LAND_USE = '11111111-1111-4111-8111-111111111111'
const ZONING = '22222222-2222-4222-8222-222222222222'
const HOOD = '33333333-3333-4333-8333-333333333333'
const DEF_A = '44444444-4444-4444-8444-444444444444'
const DEF_B = '55555555-5555-4555-8555-555555555555'
const MISSING = '99999999-9999-4999-8999-999999999999'

function fakeTransport(calls: string[]) {
  return createRouterTransport(({ service }) => {
    service(LandUsesService, {
      getLandUses: () => {
        calls.push('getLandUses')
        return {
          landUses: {
            [LAND_USE]: {
              id: LAND_USE,
              name: 'Single family',
              code: 'SF',
              description: 'Detached houses',
              landUseTypeId: 'type-1',
              landUseTypeName: 'Residential',
            },
          },
        }
      },
    })
    service(ZoningService, {
      getZoning: () => ({
        zoning: { [ZONING]: { id: ZONING, name: 'Low density', code: 'R1', maxFar: 0.5 } },
      }),
    })
    service(NeighborhoodService, {
      getNeighborhoods: () => ({
        neighborhoods: {
          [HOOD]: { id: HOOD, name: 'Harbor', neighborhoodDefinitionIds: [DEF_A, DEF_B] },
        },
      }),
      getNeighborhoodDefinitions: () => ({
        neighborhoodDefinitions: {
          [DEF_A]: { id: DEF_A, name: 'Assessment areas' },
          [DEF_B]: { id: DEF_B, name: 'Planning districts' },
        },
      }),
    })
  })
}

describe('lookup pages', () => {
  test('land use: its fields, with the type as plain text; one request', async () => {
    const calls: string[] = []
    await renderApp(`/land-uses/${LAND_USE}`, fakeTransport(calls))
    expect(await screen.findByRole('heading', { name: 'Land use: Single family' })).toBeDefined()
    expect(screen.getByText('Detached houses')).toBeDefined()
    expect(screen.getByText('Residential')).toBeDefined()
    expect(screen.queryByRole('link', { name: 'Residential' })).toBeNull()
    expect(calls).toEqual(['getLandUses'])
  })

  test('zoning: its fields', async () => {
    await renderApp(`/zoning/${ZONING}`, fakeTransport([]))
    expect(await screen.findByRole('heading', { name: 'Zoning: Low density' })).toBeDefined()
    expect(screen.getByText('R1')).toBeDefined()
    expect(screen.getByText('0.5')).toBeDefined()
  })

  test('neighborhood: lists its definitions by name', async () => {
    await renderApp(`/neighborhoods/${HOOD}`, fakeTransport([]))
    expect(await screen.findByRole('heading', { name: 'Neighborhood: Harbor' })).toBeDefined()
    expect(await screen.findByText('Assessment areas')).toBeDefined()
    expect(screen.getByText('Planning districts')).toBeDefined()
  })

  test.each([
    `/land-uses/${MISSING}`,
    `/zoning/${MISSING}`,
    `/neighborhoods/${MISSING}`,
  ])('%s, an ID not in the lookup, is "Not found"', async (path) => {
    await renderApp(path, fakeTransport([]))
    expect(await screen.findByRole('heading', { name: 'Not found' })).toBeDefined()
  })
})
