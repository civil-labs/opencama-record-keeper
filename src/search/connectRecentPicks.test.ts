// The startup wiring for recent picks, end to end: a real Auth (with a fake
// OIDC UserManager) and the browser's localStorage. Sign-out must remove the
// user's picks; a forced re-sign-in must keep them.
import type { User, UserManagerEvents } from 'oidc-client-ts'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { Auth, type UserManagerLike } from '../auth.ts'
import { connectRecentPicks, STORAGE_KEY_PREFIX } from './recentPicks.ts'

const KEY = `${STORAGE_KEY_PREFIX}u1`
const pick = { parcelId: 'p1', formattedAddress: '1 Fixture Way' }

function fakeUserManager() {
  const unloaded: (() => void)[] = []
  let stored: User | null = { profile: { sub: 'u1' } } as User
  return {
    settings: { authority: 'http://issuer.test', client_id: 'test' },
    events: {
      addUserLoaded: () => {},
      addUserUnloaded: (cb: () => void) => unloaded.push(cb),
      addAccessTokenExpiring: () => {},
    } as unknown as UserManagerEvents,
    getUser: vi.fn(() => Promise.resolve(stored)),
    removeUser: vi.fn(() => {
      stored = null
      for (const cb of unloaded) cb()
      return Promise.resolve()
    }),
    signinRedirect: vi.fn(() => Promise.resolve()),
    signinCallback: vi.fn(),
    signinSilent: vi.fn(),
  }
}

async function setup() {
  const um = fakeUserManager()
  const auth = new Auth(um as unknown as UserManagerLike)
  await auth.start(new EventTarget() as Window)
  const picks = connectRecentPicks(auth, window)
  picks.push(pick)
  expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify([pick]))
  return { um, auth, picks }
}

beforeEach(() => window.localStorage.clear())
afterEach(() => window.localStorage.clear())

test("signing out removes the signed-in user's picks", async () => {
  const { um, auth, picks } = await setup()
  void auth.signOut()
  await vi.waitFor(() => expect(um.signinRedirect).toHaveBeenCalled())
  expect(window.localStorage.getItem(KEY)).toBeNull()
  expect(picks.get()).toEqual([])
})

test('a forced re-sign-in (expired or rejected session) keeps them', async () => {
  const { um, auth } = await setup()
  void auth.clearAndSignIn('/parcels')
  await vi.waitFor(() => expect(um.signinRedirect).toHaveBeenCalled())
  expect(window.localStorage.getItem(KEY)).toBe(JSON.stringify([pick]))
})
