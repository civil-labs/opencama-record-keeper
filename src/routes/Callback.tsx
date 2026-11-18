import { useRouteContext, type ErrorComponentProps } from '@tanstack/react-router'
import { DEFAULT_RETURN_TO } from '../auth.ts'
import { ErrorAlert } from '../components/ErrorAlert.tsx'

/** Shown only while the callback's loader exchanges the code for tokens. */
export function Callback() {
  return <p>Signing in…</p>
}

/**
 * Sign-in failed, for example because /callback was reloaded after its state
 * was used. Show why, and offer a fresh sign-in.
 */
export function CallbackError({ error }: ErrorComponentProps) {
  const { auth } = useRouteContext({ from: '/callback' })
  return (
    <>
      <h1>Sign-in failed</h1>
      <ErrorAlert error={error} />
      <button type="button" onClick={() => void auth.signIn(DEFAULT_RETURN_TO)}>
        Sign in again
      </button>
    </>
  )
}
