// Query options for parcel reads, shared by loaders, the map and the pane.
import { ParcelsService } from '@civil-labs/civil-os-api'
import type { Transport } from '@connectrpc/connect'
import { createQueryOptions } from '@connectrpc/connect-query'
import { lookupQueryOptions } from './queryClient.ts'

/** The whole jurisdiction's extent: the map's bounds when the metadata has none. */
export const estimatedExtentQuery = (transport: Transport) => ({
  ...createQueryOptions(ParcelsService.method.getEstimatedParcelsExtentWGS84, {}, { transport }),
  ...lookupQueryOptions,
})

/** The parcel IDs for map features, keyed by feature ID as a decimal string. */
export const parcelIdsByFeatureQuery = (transport: Transport, featureIds: bigint[]) =>
  createQueryOptions(ParcelsService.method.getParcelIdsByFeatureId, { featureIds }, { transport })

/**
 * One parcel with its improvement summary. `neighborhoodDefinitionId` picks
 * which definition its neighborhood is read under; unset, it has none.
 */
export const parcelQuery = (
  transport: Transport,
  parcelId: string,
  neighborhoodDefinitionId?: string,
) =>
  createQueryOptions(
    ParcelsService.method.getParcelsWithImprovementSummaryByParcelId,
    { parcelIds: [parcelId], neighborhoodDefinitionId },
    { transport },
  )

/** The bounding box of one parcel's current geometry, if it has one. */
export const parcelExtentQuery = (transport: Transport, parcelId: string) =>
  createQueryOptions(
    ParcelsService.method.getParcelExtentsWGS84ByParcelId,
    { parcelIds: [parcelId] },
    { transport },
  )
