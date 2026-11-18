// QueryClient defaults: cache policy, retry policy, Unauthenticated handler
// (spec: Data fetching).
import { Code, ConnectError } from '@connectrpc/connect'
import { QueryCache, QueryClient } from '@tanstack/react-query'
import { currentPath, type Auth } from '../auth.ts'

/** Records (parcels, transfers, addresses, parties): refetched after 30 s. */
export const RECORD_STALE_TIME = 30_000

/**
 * Whole-table lookups (land uses, zoning, neighborhoods): fetched once per
 * session, then shared by link labels and lookup pages.
 */
export const lookupQueryOptions = { staleTime: Infinity } as const

/**
 * Neighborhood definitions: fetched on app load for the parcels page's
 * selector, and never refetched or dropped while the app is open.
 */
export const definitionsQueryOptions = {
  staleTime: Infinity,
  gcTime: Infinity,
} as const

/** Transient failures, worth retrying. */
const RETRY_CODES = new Set([
  Code.Unavailable,
  Code.DeadlineExceeded,
  Code.ResourceExhausted,
])

const MAX_RETRIES = 3

/**
 * Retries only transient failures, up to 3 times. Everything else, including
 * Unauthenticated, PermissionDenied, NotFound, InvalidArgument and
 * FailedPrecondition, fails at once: retrying can't change the answer.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  return (
    RETRY_CODES.has(ConnectError.from(error).code) && failureCount < MAX_RETRIES
  )
}

export function createQueryClient(
  auth: Pick<Auth, 'clearAndSignIn'>,
  returnTo: () => string = currentPath,
): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      // The transport's interceptor already handles Unauthenticated; this
      // catches one that reaches a query by any other path.
      onError: (error) => {
        if (ConnectError.from(error).code === Code.Unauthenticated) {
          void auth.clearAndSignIn(returnTo())
        }
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: RECORD_STALE_TIME,
        retry: shouldRetry,
      },
    },
  })
}
