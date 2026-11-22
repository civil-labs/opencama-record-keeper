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

/** A Connect page: where the next page starts. Each caller names its rows. */
export interface Page {
  pageInfo?: { hasNextPage: boolean; endCursor?: string }
}

/** The next page's cursor, or undefined when there's no next page. */
export function nextCursor(page: Page): string | undefined {
  return page.pageInfo?.hasNextPage ? page.pageInfo.endCursor : undefined
}

/** Options shared by every paginated query, for `useInfiniteQuery`. */
export const pagedOptions = { pageParamKey: 'after', getNextPageParam: nextCursor } as const

export function PagedList<P extends Page, T>({
  query,
  rows,
  children,
}: {
  query: UseInfiniteQueryResult<InfiniteData<P>, ConnectError>
  /** The rows on one page, such as `(page) => page.transfers`. */
  rows: (page: P) => T[]
  /** Renders the loaded rows; never called with none. */
  children: (rows: T[]) => ReactNode
}) {
  if (query.isPending) return <p>Loading…</p>
  // A failed first page has no data. A failed "More" keeps the pages already
  // loaded, and shows its error below them.
  if (!query.data) return <ErrorAlert error={query.error} />
  const loaded = query.data.pages.flatMap(rows)
  return (
    <>
      {loaded.length === 0 ? <p>None.</p> : children(loaded)}
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
