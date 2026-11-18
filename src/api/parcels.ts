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
