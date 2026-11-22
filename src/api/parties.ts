// Query options for parties (spec: Party).
import { PartiesService, type GetParcelsByPartyIdResponse } from '@civil-labs/civil-os-api'
import type { Transport } from '@connectrpc/connect'
import { createQueryOptions, useInfiniteQuery } from '@connectrpc/connect-query'
import { edgeNodes, FIRST_PAGE, PAGE_SIZE, pagedOptions } from '../components/PagedList.tsx'

/** One party, from the `parties` map keyed by ID. */
export const partyQuery = (transport: Transport, partyId: string) =>
  createQueryOptions(PartiesService.method.getPartiesById, { partyIds: [partyId] }, { transport })

/** The parcels a party has a share in, a page at a time. */
export const useParcelsByParty = (partyId: string) =>
  useInfiniteQuery(
    PartiesService.method.getParcelsByPartyId,
    { partyId, first: PAGE_SIZE, after: FIRST_PAGE },
    pagedOptions,
  )

/** The rows on one page of `useParcelsByParty`. */
export const parcelsByPartyRows = (page: GetParcelsByPartyIdResponse) => edgeNodes(page)
