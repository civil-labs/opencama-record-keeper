// The one Connect transport for every authenticated RPC (spec: Data fetching).
import { Code, ConnectError, type Interceptor } from '@connectrpc/connect'
import { createConnectTransport } from '@connectrpc/connect-web'
import { currentPath, type Auth } from '../auth.ts'

/**
 * Adds `Authorization: Bearer <id_token>` to every request. The gateway checks
 * the token's `aud` against its allowed client IDs, so it's the ID token, not
 * the access token.
 *
 * With no valid token, or when the gateway answers Unauthenticated, it clears
 * the session and starts a sign-in that returns to the current page. Those
 * requests never settle: the page is navigating away.
 */
export function createAuthInterceptor(
  auth: Pick<Auth, 'getIdToken' | 'clearAndSignIn'>,
  returnTo: () => string = currentPath,
): Interceptor {
  return (next) => async (request) => {
    const token = await auth.getIdToken()
    if (token === null) return auth.clearAndSignIn(returnTo())
    request.header.set('Authorization', `Bearer ${token}`)
    try {
      return await next(request)
    } catch (error) {
      if (ConnectError.from(error).code === Code.Unauthenticated) {
        return auth.clearAndSignIn(returnTo())
      }
      throw error
    }
  }
}

export function createTransport(gatewayUrl: string, auth: Auth) {
  return createConnectTransport({
    baseUrl: gatewayUrl,
    interceptors: [createAuthInterceptor(auth)],
  })
}
