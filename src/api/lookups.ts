// Query options for the whole-table lookups (spec: Data fetching). Loaders and
// pages use the same options, so they share one cache entry, fetched once per
// session and shared with link labels.
import {
  ImprovementsService,
  LandUsesService,
  NeighborhoodsService,
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
  ...createQueryOptions(NeighborhoodsService.method.getNeighborhoods, {}, { transport }),
  ...lookupQueryOptions,
})

export const neighborhoodDefinitionsQuery = (transport: Transport) => ({
  ...createQueryOptions(
    NeighborhoodsService.method.getNeighborhoodDefinitions,
    {},
    { transport },
  ),
  ...definitionsQueryOptions,
})

export const improvementTypesQuery = (transport: Transport) => ({
  ...createQueryOptions(ImprovementsService.method.getImprovementTypes, {}, { transport }),
  ...lookupQueryOptions,
})

export const improvementConditionsQuery = (transport: Transport) => ({
  ...createQueryOptions(ImprovementsService.method.getImprovementConditions, {}, { transport }),
  ...lookupQueryOptions,
})

export const improvementQualitiesQuery = (transport: Transport) => ({
  ...createQueryOptions(ImprovementsService.method.getImprovementQualities, {}, { transport }),
  ...lookupQueryOptions,
})

/** A label for each ID that a lookup map knows, by its `name`. */
export function labels(map: Record<string, { name: string }> | undefined) {
  return Object.fromEntries(Object.entries(map ?? {}).map(([id, { name }]) => [id, name]))
}
