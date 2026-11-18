// A paginated list of real property transfers (spec: Transfers section),
// shared by the parcel pane and the party page.
import {
  RealPropertyTransfersService,
  type RealPropertyTransferEdge,
} from '@civil-labs/civil-os-api'
import { useInfiniteQuery } from '@connectrpc/connect-query'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import { RecordLink } from '../links.tsx'
import { ErrorAlert } from './ErrorAlert.tsx'
import { formatTimestamp } from './Fields.tsx'

/** Transfers fetched per page. */
export const TRANSFERS_PAGE_SIZE = 25

interface TransfersPage {
  edges: RealPropertyTransferEdge[]
  pageInfo?: { hasNextPage: boolean; endCursor?: string }
}

/** The next page's cursor, or undefined when there's no next page. */
export function nextTransfersCursor(page: TransfersPage): string | undefined {
  return page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : undefined
}

/**
 * The first page's `after`: unset. Connect-Query types the page-param field
 * as a required string, but the gateway rejects an empty cursor
 * (`string.min_len`), and protobuf-es leaves an undefined field out of the
 * request. So the first page passes undefined, through this one cast.
 */
export const FIRST_PAGE = undefined as unknown as string

/** A parcel's transfers, a page at a time. Loaded pages stay cached. */
export function useTransfersByParcel(parcelId: string) {
  return useInfiniteQuery(
    RealPropertyTransfersService.method.getTransfersByParcelId,
    { parcelIds: [parcelId], first: TRANSFERS_PAGE_SIZE, after: FIRST_PAGE },
    { pageParamKey: 'after', getNextPageParam: nextTransfersCursor },
  )
}

/**
 * A table of time, amount and a link to each transfer, with "More" while
 * there's a next page. It loads and fails on its own; the page around it stays.
 */
export function TransfersList({
  query,
}: {
  query: UseInfiniteQueryResult<InfiniteData<TransfersPage>>
}) {
  if (query.isPending) return <p>Loading…</p>
  // A failed first page has no data. A failed "More" keeps the pages already
  // loaded, and shows its error below them.
  if (!query.data) return <ErrorAlert error={query.error} />
  const transfers = query.data.pages.flatMap((page) =>
    page.edges.flatMap((edge) => (edge.node ? [edge.node] : [])),
  )
  return (
    <>
      {transfers.length === 0 ? (
        <p>None.</p>
      ) : (
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
      {query.isFetchNextPageError && <ErrorAlert error={query.error} />}
      {query.hasNextPage && (
        <button
          type="button"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {query.isFetchingNextPage ? 'Loading…' : 'More'}
        </button>
      )}
    </>
  )
}
