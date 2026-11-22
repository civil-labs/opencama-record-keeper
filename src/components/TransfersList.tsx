// A paginated table of real property transfers (spec: Transfers section),
// shared by the parcel pane and the party page.
import {
  RealPropertyTransfersService,
  type GetTransfersByParcelIdResponse,
  type GetTransfersByPartyIdResponse,
} from '@civil-labs/civil-os-api'
import type { ConnectError } from '@connectrpc/connect'
import { useInfiniteQuery } from '@connectrpc/connect-query'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { RecordLink } from '../links.tsx'
import { formatTimestamp } from './Fields.tsx'
import { edgeNodes, FIRST_PAGE, PAGE_SIZE, PagedList, pagedOptions } from './PagedList.tsx'

/** A parcel's transfers, a page at a time. Loaded pages stay cached. */
export function useTransfersByParcel(parcelId: string) {
  return useInfiniteQuery(
    RealPropertyTransfersService.method.getTransfersByParcelId,
    { parcelIds: [parcelId], first: PAGE_SIZE, after: FIRST_PAGE },
    pagedOptions,
  )
}

/** A party's transfers, as grantor or grantee, a page at a time. */
export function useTransfersByParty(partyId: string) {
  return useInfiniteQuery(
    RealPropertyTransfersService.method.getTransfersByPartyId,
    { partyIds: [partyId], first: PAGE_SIZE, after: FIRST_PAGE },
    pagedOptions,
  )
}

/** A page of a parcel's or a party's transfers. */
export type TransfersPage = GetTransfersByParcelIdResponse | GetTransfersByPartyIdResponse

/** The rows on one page of transfers. */
export const transfersRows = (page: TransfersPage) => edgeNodes(page)

/** Time, amount and a link to each transfer, with "More" while there's a next page. */
export function TransfersList({
  query,
}: {
  query: UseInfiniteQueryResult<InfiniteData<TransfersPage>, ConnectError>
}) {
  return (
    <PagedList query={query} rows={transfersRows}>
      {(transfers) => (
        <table>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Amount</th>
              <th scope="col">Transfer</th>
            </tr>
          </thead>
          <tbody>
            {transfers.map((transfer) => (
              <tr key={transfer.transferId}>
                <td>{transfer.transferTime ? formatTimestamp(transfer.transferTime) : '—'}</td>
                <td>{transfer.transferAmount || '—'}</td>
                <td>
                  <RecordLink type="transfer" id={transfer.transferId} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </PagedList>
  )
}
