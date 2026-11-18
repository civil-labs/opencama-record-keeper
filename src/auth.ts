// Sign-in with OIDC authorization code + PKCE, in the browser (spec: Auth).
//
// The gateway authenticates requests with the ID token, so a session is valid
// exactly as long as its ID token is unexpired. Everything here is judged by
// the ID token's own `exp` claim, not by the access token's expiry.
import {
  UserManager,
  WebStorageStateStore,
  type User,
  type UserManagerSettings,
} from 'oidc-client-ts'

/** Treat an ID token this close to expiry as expired, to allow for clock skew. */
const EXPIRY_SKEW_SECONDS = 30

/** Where sign-in returns to when there's no usable saved URL. */
export const DEFAULT_RETURN_TO = '/parcels'

interface SignInState {
  returnTo: string
}

/** The `exp` claim of a JWT, in seconds, or null if it can't be read. */
export function jwtExpiry(token: string): number | null {
  const payload = token.split('.')[1]
  if (payload === undefined) return null
  try {
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const claims: unknown = JSON.parse(atob(base64))
    if (typeof claims !== 'object' || claims === null) return null
    const exp = (claims as Record<string, unknown>).exp
    return typeof exp === 'number' ? exp : null
  } catch {
    return null
  }
}

/** True if the user has an ID token that hasn't expired (allowing for skew). */
export function hasValidIdToken(
  user: User | null | undefined,
  nowSeconds: number = Date.now() / 1000,
): user is User & { id_token: string } {
  if (!user?.id_token) return false
  const exp = jwtExpiry(user.id_token)
  return exp !== null && exp - EXPIRY_SKEW_SECONDS > nowSeconds
}

/**
 * A same-origin path to return to after sign-in. Anything else (an absolute
 * URL, a protocol-relative `//host` path, a missing value) falls back to
 * DEFAULT_RETURN_TO, so the saved state can't send the user off-site.
 */
export function safeReturnTo(state: unknown): string {
  if (typeof state !== 'object' || state === null) return DEFAULT_RETURN_TO
  const returnTo = (state as Partial<SignInState>).returnTo
  if (
    typeof returnTo !== 'string' ||
    !returnTo.startsWith('/') ||
    returnTo.startsWith('//') ||
    returnTo.startsWith('/\\')
  ) {
    return DEFAULT_RETURN_TO
  }
  return returnTo
}

/** The settings the spec fixes for the UserManager. */
export function userManagerSettings(
  authority: string,
  clientId: string,
  origin: string,
  storage: Storage,
): UserManagerSettings {
  return {
    authority,
    client_id: clientId,
    redirect_uri: `${origin}/callback`,
    response_type: 'code',
    // offline_access asks for a refresh token. Dex issues one only on request.
    scope: 'openid profile email offline_access',
    // localStorage, so a session survives new tabs and browser restarts.
    userStore: new WebStorageStateStore({ store: storage }),
  }
}

/** The current browser path, to return to after sign-in. */
export function currentPath(): string {
  const { pathname, search, hash } = window.location
  return `${pathname}${search}${hash}`
}

/** A promise that never settles, for code paths that end in a page navigation. */
function navigatingAway(): Promise<never> {
  return new Promise<never>(() => {})
}

export class Auth {
  readonly userManager: UserManager
  private redirecting = false

  constructor(userManager: UserManager) {
    this.userManager = userManager
  }

  static create(authority: string, clientId: string): Auth {
    return new Auth(
      new UserManager(
        userManagerSettings(
          authority,
          clientId,
          window.location.origin,
          window.localStorage,
        ),
      ),
    )
  }

  /**
   * The ID token to send to the gateway, or null if there's no valid session.
   * It reads the stored user each time, so a token another tab stored is used.
   */
  async getIdToken(): Promise<string | null> {
    const user = await this.userManager.getUser()
    return hasValidIdToken(user) ? user.id_token : null
  }

  /**
   * Sends the browser to the IdP's authorization endpoint (signinRedirect),
   * saving `returnTo` in the sign-in state. It's the app's only redirect to the
   * IdP. The returned promise never settles: the page is navigating away.
   */
  async signIn(returnTo: string): Promise<never> {
    if (!this.redirecting) {
      this.redirecting = true
      const state: SignInState = { returnTo }
      await this.userManager.signinRedirect({ state })
    }
    return navigatingAway()
  }

  /** Finishes sign-in on /callback, and returns the path to go back to. */
  async completeSignIn(): Promise<string> {
    const user = await this.userManager.signinCallback()
    return safeReturnTo(user?.state)
  }
}
