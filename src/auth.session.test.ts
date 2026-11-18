// Session renewal and tab sync (spec: Session renewal), against a fake
// UserManager whose "stored user" stands in for localStorage.
import type { User, UserManagerEvents } from 'oidc-client-ts'
import { describe, expect, test, vi } from 'vitest'
import { Auth, type UserManagerLike } from './auth.ts'

const AUTHORITY = 'http://localhost:5556/dex'
const CLIENT_ID = 'record-keeper-dev'
const KEY = `oidc.user:${AUTHORITY}:${CLIENT_ID}`

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function idToken(expiresInSeconds: number, sub = 'u1'): string {
  const exp = Math.floor(Date.now() / 1000) + expiresInSeconds
  return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify({ exp, sub }))}.sig`
}

function user(fields: Partial<User>): User {
  return { profile: { sub: 'u1' }, ...fields } as User
}

const valid = () => user({ id_token: idToken(3600), refresh_token: 'r1' })
const expired = (refresh_token?: string) =>
  user({ id_token: idToken(-60), refresh_token })

class FakeUserManager {
  stored: User | null
  private loaded: ((user: User) => void)[] = []
  private unloaded: (() => void)[] = []
  expiring: (() => void)[] = []

  constructor(stored: User | null) {
    this.stored = stored
  }

  settings = { authority: AUTHORITY, client_id: CLIENT_ID }

  events = {
    addUserLoaded: (cb: (user: User) => void) => this.loaded.push(cb),
    addUserUnloaded: (cb: () => void) => this.unloaded.push(cb),
    addAccessTokenExpiring: (cb: () => void) => this.expiring.push(cb),
  } as unknown as UserManagerEvents

  getUser = vi.fn((raiseEvent = false) => {
    if (raiseEvent && this.stored) for (const cb of this.loaded) cb(this.stored)
    return Promise.resolve(this.stored)
  })

  removeUser = vi.fn(() => {
    this.stored = null
    for (const cb of this.unloaded) cb()
    return Promise.resolve()
  })

  signinRedirect = vi.fn(() => Promise.resolve())
  signinCallback = vi.fn()
  signinSilent = vi.fn((): Promise<User | null> => Promise.resolve(null))

  /** What a successful refresh does: store the user and raise userLoaded. */
  store(next: User) {
    this.stored = next
    for (const cb of this.loaded) cb(next)
  }
}

function setup(stored: User | null) {
  const um = new FakeUserManager(stored)
  const auth = new Auth(um as unknown as UserManagerLike)
  return { um, auth }
}

describe('getIdToken', () => {
  test('returns a valid stored ID token without renewing', async () => {
    const stored = valid()
    const { um, auth } = setup(stored)
    expect(await auth.getIdToken()).toBe(stored.id_token)
    expect(um.signinSilent).not.toHaveBeenCalled()
  })

  test('renews an expired ID token with the refresh token', async () => {
    const { um, auth } = setup(expired('r1'))
    const renewed = valid()
    um.signinSilent.mockImplementation(() => {
      um.store(renewed)
      return Promise.resolve(renewed)
    })
    expect(await auth.getIdToken()).toBe(renewed.id_token)
    expect(um.signinSilent).toHaveBeenCalledOnce()
  })

  test('a refresh that returns no new id_token is a failed renewal', async () => {
    // oidc-client-ts keeps the old id_token when the response has none.
    const old = expired('r1')
    const { um, auth } = setup(old)
    um.signinSilent.mockImplementation(() => {
      const kept = user({ id_token: old.id_token, refresh_token: 'r2' })
      um.store(kept)
      return Promise.resolve(kept)
    })
    expect(await auth.getIdToken()).toBeNull()
  })

  test('after a failed renewal, uses a user another tab stored', async () => {
    const { um, auth } = setup(expired('r1'))
    const fromOtherTab = valid()
    um.signinSilent.mockImplementation(() => {
      // The other tab rotated the refresh token first, so ours is rejected.
      um.stored = fromOtherTab
      return Promise.reject(new Error('invalid_grant'))
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await auth.getIdToken()).toBe(fromOtherTab.id_token)
  })

  test('without a refresh token, never renews', async () => {
    const { um, auth } = setup(expired())
    expect(await auth.getIdToken()).toBeNull()
    expect(um.signinSilent).not.toHaveBeenCalled()
  })

  test('no stored user', async () => {
    const { auth } = setup(null)
    expect(await auth.getIdToken()).toBeNull()
  })

  test('concurrent calls share one renewal', async () => {
    const { um, auth } = setup(expired('r1'))
    const renewed = valid()
    um.signinSilent.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 10))
      um.store(renewed)
      return renewed
    })
    const tokens = await Promise.all([
      auth.getIdToken(),
      auth.getIdToken(),
      auth.getIdToken(),
    ])
    expect(tokens).toEqual([renewed.id_token, renewed.id_token, renewed.id_token])
    expect(um.signinSilent).toHaveBeenCalledOnce()
  })
})

describe('renewal before expiry', () => {
  test('accessTokenExpiring renews with the refresh token', async () => {
    const { um, auth } = setup(valid())
    await auth.start(new EventTarget() as Window)
    for (const cb of um.expiring) cb()
    await auth.renew()
    expect(um.signinSilent).toHaveBeenCalledOnce()
  })
})

describe('tab sync', () => {
  async function started(stored: User | null) {
    const { um, auth } = setup(stored)
    const win = new EventTarget() as Window
    await auth.start(win)
    const storage = (key: string | null, newValue: string | null) => {
      win.dispatchEvent(new StorageEvent('storage', { key, newValue }))
      return new Promise((r) => setTimeout(r, 0))
    }
    return { um, auth, storage }
  }

  test('start loads the stored user', async () => {
    const stored = valid()
    const { auth } = await started(stored)
    expect(auth.getUser()).toBe(stored)
  })

  test('another tab renewing updates the user and notifies subscribers', async () => {
    const { um, auth, storage } = await started(valid())
    const listener = vi.fn()
    auth.subscribe(listener)
    const renewed = valid()
    um.stored = renewed
    await storage(KEY, '{}')
    expect(auth.getUser()).toBe(renewed)
    expect(listener).toHaveBeenCalled()
  })

  test('another tab signing out sends this tab to sign-in', async () => {
    const { um, auth, storage } = await started(valid())
    um.stored = null
    await storage(KEY, null)
    expect(auth.getUser()).toBeNull()
    expect(um.signinRedirect).toHaveBeenCalledOnce()
  })

  test('ignores other keys', async () => {
    const { um, storage } = await started(valid())
    um.stored = null
    await storage('something-else', null)
    expect(um.signinRedirect).not.toHaveBeenCalled()
  })
})
