// The address search query (spec: Calling), for the navbar's search box.
import {
  ParcelsService,
  type ParcelSearchHit,
} from '@civil-labs/civil-os-api'
import type { ConnectError } from '@connectrpc/connect'
import { useQuery } from '@connectrpc/connect-query'
import { keepPreviousData, skipToken } from '@tanstack/react-query'
import { isSearchable } from '../search/query.ts'
import { useDebouncedValue } from '../search/useDebouncedValue.ts'

export const SEARCH_DEBOUNCE_MS = 250
export const SEARCH_PAGE_SIZE = 10

/** What the search box should show for the text in it. */
export type AddressSearchState =
  /** The input is empty. */
  | { status: 'empty' }
  /** Fewer than 3 letters or digits: no call is made. */
  | { status: 'tooShort' }
  /** The first search for this text is on its way, with nothing to show yet. */
  | { status: 'searching' }
  | { status: 'error'; error: ConnectError }
  | {
      status: 'results'
      hits: readonly ParcelSearchHit[]
      hasNextPage: boolean
      /** These hits are for earlier text; a search for the current text is on its way. */
      stale: boolean
    }

/**
 * Searches for `raw` once typing pauses. The text is sent as typed. While
 * the next search loads, the previous hits stay, marked stale. Each text has
 * its own cache entry, so a slow response for older text is never shown as
 * the current one, and a superseded request is aborted.
 */
export function useAddressSearch(raw: string): AddressSearchState {
  const debounced = useDebouncedValue(raw, SEARCH_DEBOUNCE_MS)
  const query = useQuery(
    ParcelsService.method.searchParcelsAddresses,
    isSearchable(debounced) ? { query: debounced, first: SEARCH_PAGE_SIZE } : skipToken,
    {
      placeholderData: keepPreviousData,
      staleTime: 30_000,
      // Coming back to the tab mustn't reorder an open dropdown.
      refetchOnWindowFocus: false,
    },
  )

  if (raw === '') return { status: 'empty' }
  if (!isSearchable(raw)) return { status: 'tooShort' }
  const waiting = raw !== debounced
  if (query.error && !waiting && !query.isFetching) {
    return { status: 'error', error: query.error }
  }
  if (!query.data) return { status: 'searching' }
  return {
    status: 'results',
    hits: query.data.hits,
    hasNextPage: query.data.pageInfo?.hasNextPage ?? false,
    stale: waiting || query.isPlaceholderData,
  }
}
