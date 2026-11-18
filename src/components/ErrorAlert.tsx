import { Code, ConnectError } from '@connectrpc/connect'

/** Shows an error as plain text. Connect errors show their code and message. */
export function ErrorAlert({ error }: { error: unknown }) {
  if (error instanceof ConnectError) {
    return (
      <p role="alert">
        {Code[error.code]}: {error.rawMessage}
      </p>
    )
  }
  const message = error instanceof Error ? error.message : String(error)
  return <p role="alert">{message}</p>
}
