// Query options for the whole-table lookups (spec: Data fetching). Loaders and
// pages use the same options, so they share one cache entry, fetched once per
// session and shared with link labels.
import {
  LandUsesService,
  NeighborhoodService,
  ZoningService,
} from '@civil-labs/civil-os-api'
import type { Transport } from '@connectrpc/connect'
import { createQueryOptions } from '@connectrpc/connect-query'
import { definitionsQueryOptions, lookupQueryOptions } from './queryClient.ts'

export const landUsesQuery = (transport: Transport) => ({
  ...createQueryOptions(LandUsesService.method.getLandUses, {}, { transport }),
  ...lookupQueryOptions,
})

export const zoningQuery = (transport: Transport) => ({
  ...createQueryOptions(ZoningService.method.getZoning, {}, { transport }),
  ...lookupQueryOptions,
})

export const neighborhoodsQuery = (transport: Transport) => ({
  ...createQueryOptions(NeighborhoodService.method.getNeighborhoods, {}, { transport }),
  ...lookupQueryOptions,
})

export const neighborhoodDefinitionsQuery = (transport: Transport) => ({
  ...createQueryOptions(
    NeighborhoodService.method.getNeighborhoodDefinitions,
    {},
    { transport },
  ),
  ...definitionsQueryOptions,
})
