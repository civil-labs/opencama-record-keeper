import { useQueryErrorResetBoundary } from '@tanstack/react-query'
import { useRouter, type ErrorComponentProps } from '@tanstack/react-router'
import { ErrorAlert } from './ErrorAlert.tsx'

/**
 * A route whose loader or main query failed (spec: Errors and loading): the
 * Connect code and message, and a Retry that clears the failed query and runs
 * the route's loader again.
 */
export function RouteError({ error, reset }: ErrorComponentProps) {
  const router = useRouter()
  const queryErrorResetBoundary = useQueryErrorResetBoundary()
  return (
    <>
      <ErrorAlert error={error} />
      <button
        type="button"
        onClick={() => {
          queryErrorResetBoundary.reset()
          reset()
          void router.invalidate()
        }}
      >
        Retry
      </button>
    </>
  )
}
