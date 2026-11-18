// A paginated section (spec: Transfers section, Address and Party sections):
// a page at a time, "More" while there's a next page. It loads and fails on
// its own; the page around it stays.
import type { ConnectError } from '@connectrpc/connect'
import type { InfiniteData, UseInfiniteQueryResult } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ErrorAlert } from './ErrorAlert.tsx'

/** Rows fetched per page. */
export const PAGE_SIZE = 25

/**
 * The first page's `after`: unset. Connect-Query types the page-param field
 * as a required string, but the gateway rejects an empty cursor
 * (`string.min_len`), and protobuf-es leaves an undefined field out of the
 * request. So the first page passes undefined, through this one cast.
 */
export const FIRST_PAGE = undefined as unknown as string

/** A Connect page: edges with nodes, and where the next page starts. */
export interface Page<T> {
  edges: { node?: T }[]
  pageInfo?: { hasNextPage: boolean; endCursor?: string }
}

/** The next page's cursor, or undefined when there's no next page. */
export function nextCursor(page: Page<unknown>): string | undefined {
  return page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : undefined
}

/** Options shared by every paginated query, for `useInfiniteQuery`. */
export const pagedOptions = { pageParamKey: 'after', getNextPageParam: nextCursor } as const

export function PagedList<T>({
  query,
  children,
}: {
  query: UseInfiniteQueryResult<InfiniteData<Page<T>>, ConnectError>
  /** Renders the loaded rows; never called with none. */
  children: (nodes: T[]) => ReactNode
}) {
  if (query.isPending) return <p>Loading…</p>
  // A failed first page has no data. A failed "More" keeps the pages already
  // loaded, and shows its error below them.
  if (!query.data) return <ErrorAlert error={query.error} />
  const nodes = query.data.pages.flatMap((page) =>
    page.edges.flatMap((edge) => (edge.node ? [edge.node] : [])),
  )
  return (
    <>
      {nodes.length === 0 ? <p>None.</p> : children(nodes)}
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
