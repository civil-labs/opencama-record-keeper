// Sign-in with OIDC authorization code + PKCE, in the browser (spec: Auth).
//
// The gateway authenticates requests with the ID token, so a session is valid
// exactly as long as its ID token is unexpired. Everything here is judged by
// the ID token's own `exp` claim, not by the access token's expiry.
//
// Renewal (spec: Session renewal) uses the refresh token only, and only when
// the IdP issued one. oidc-client-ts's automaticSilentRenew is off: without a
// refresh token it falls back to an iframe renew against redirect_uri, which
// the spec rules out. A refresh response with no id_token keeps the old one,
// so it doesn't make the session valid again; the ID token's exp decides.
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

/**
 * The name the navbar shows: `name`, falling back to `preferred_username`,
 * then `email`, then `sub` (spec: Navbar).
 */
export function userDisplayName(user: User): string {
  const { name, preferred_username, email, sub } = user.profile
  for (const value of [name, preferred_username, email]) {
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return sub
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
    // Renewal is done by Auth, with the refresh token only (see above).
    automaticSilentRenew: false,
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

/** The parts of oidc-client-ts's UserManager that Auth uses. */
export type UserManagerLike = Pick<
  UserManager,
  | 'events'
  | 'getUser'
  | 'removeUser'
  | 'settings'
  | 'signinCallback'
  | 'signinRedirect'
  | 'signinSilent'
>

export class Auth {
  readonly userManager: UserManagerLike
  private redirecting = false
  private renewal: Promise<void> | null = null
  private user: User | null = null
  private readonly listeners = new Set<() => void>()

  constructor(userManager: UserManagerLike) {
    this.userManager = userManager
    const { events } = userManager
    events.addUserLoaded((user) => this.setUser(user))
    events.addUserUnloaded(() => this.setUser(null))
    // Fires shortly before the access token expires. Dex gives the access and
    // ID tokens the same lifetime, so this is the time to renew both.
    events.addAccessTokenExpiring(() => void this.renew())
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

  /** The localStorage key oidc-client-ts stores the user under. */
  get userStorageKey(): string {
    const { authority, client_id } = this.userManager.settings
    return `oidc.user:${authority}:${client_id}`
  }

  /**
   * Loads the stored user and starts listening to other tabs. Call once at
   * startup, before rendering.
   */
  async start(win: Window = window): Promise<void> {
    // getUser also arms the expiry timers for a stored user.
    this.setUser(await this.userManager.getUser())
    win.addEventListener('storage', (event) => void this.onStorage(event))
  }

  /** For useSyncExternalStore: the signed-in user, or null. */
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  readonly getUser = (): User | null => this.user

  private setUser(user: User | null) {
    if (user === this.user) return
    this.user = user
    for (const listener of this.listeners) listener()
  }

  /**
   * Another tab changed the stored user. All tabs share one stored user
   * (spec: Session renewal), so follow it: a renewal elsewhere is picked up,
   * and a sign-out elsewhere sends this tab to sign-in too.
   */
  private async onStorage(event: StorageEvent): Promise<void> {
    if (event.key !== this.userStorageKey && event.key !== null) return
    // getUser(true) re-reads storage, re-arms the expiry timers, and raises
    // userLoaded, which updates this.user.
    const user = await this.userManager.getUser(true)
    if (user === null) {
      this.setUser(null)
      await this.signIn(currentPath())
    }
  }

  /**
   * The ID token to send to the gateway, or null if there's no valid session.
   *
   * It reads the stored user each time, so a token another tab stored is used.
   * If the ID token has expired and there's a refresh token, it renews once and
   * reads the stored user again: if this tab's renewal failed because another
   * tab had already rotated the refresh token, that tab's result is used.
   */
  async getIdToken(): Promise<string | null> {
    let user = await this.userManager.getUser()
    if (hasValidIdToken(user)) return user.id_token
    if (!user?.refresh_token) return null
    await this.renew()
    user = await this.userManager.getUser()
    return hasValidIdToken(user) ? user.id_token : null
  }

  /**
   * Renews with the refresh token, if the stored user has one. Concurrent
   * calls share one request. A failure is logged and left for getIdToken to
   * judge, after re-reading the stored user.
   */
  renew(): Promise<void> {
    this.renewal ??= this.refresh().finally(() => {
      this.renewal = null
    })
    return this.renewal
  }

  private async refresh(): Promise<void> {
    const user = await this.userManager.getUser()
    if (!user?.refresh_token) return
    try {
      await this.userManager.signinSilent()
    } catch (error) {
      console.warn('Session renewal failed', error)
    }
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

  /**
   * Ends the app's session and starts a fresh sign-in, returning to `returnTo`.
   * Used when the gateway rejects the token, and when there's no valid token.
   * Removing the stored user also sends other tabs to sign-in.
   */
  async clearAndSignIn(returnTo: string): Promise<never> {
    if (!this.redirecting) await this.userManager.removeUser()
    return this.signIn(returnTo)
  }

  /**
   * Sign-out (spec: Sign-out): clear the app's session, then go straight to
   * sign-in, returning to /parcels. Dex has no session or logout endpoint of its
   * own, and the authorize request doesn't carry the refresh token, so the user
   * has to sign in again. Other tabs see the user removed and follow.
   */
  signOut(): Promise<never> {
    return this.clearAndSignIn(DEFAULT_RETURN_TO)
  }

  /** Finishes sign-in on /callback, and returns the path to go back to. */
  async completeSignIn(): Promise<string> {
    const user = await this.userManager.signinCallback()
    return safeReturnTo(user?.state)
  }
}
