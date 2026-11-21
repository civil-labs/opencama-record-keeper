import type { User } from 'oidc-client-ts'
import { describe, expect, test, vi } from 'vitest'
import {
  MAX_RECENT_PICKS,
  parsePicks,
  RecentPicks,
  STORAGE_KEY_PREFIX,
  type PicksStorage,
  type UserSource,
} from './recentPicks.ts'

function memoryStorage(initial: Record<string, string> = {}): PicksStorage & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
    removeItem: (key) => {
      delete data[key]
    },
  }
}

function fakeUser(sub: string | null): UserSource & { signIn(sub: string | null): void } {
  const listeners = new Set<() => void>()
  let user = toUser(sub)
  return {
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getUser: () => user,
    signIn(next) {
      user = toUser(next)
      for (const l of listeners) l()
    },
  }
}

function toUser(sub: string | null): User | null {
  return sub === null ? null : ({ profile: { sub } } as unknown as User)
}

const pick = (n: number) => ({ parcelId: `p${n}`, formattedAddress: `${n} Fixture Way` })
const KEY_A = `${STORAGE_KEY_PREFIX}user-a`
const KEY_B = `${STORAGE_KEY_PREFIX}user-b`

describe('parsePicks', () => {
  test.each([
    ['missing', null],
    ['not JSON', '{'],
    ['not an array', '{"parcelId":"p1"}'],
    ['an item of the wrong shape', '[{"parcelId":"p1"}]'],
    ['a non-object item', '["p1"]'],
    ['more than 5', JSON.stringify([1, 2, 3, 4, 5, 6].map(pick))],
  ])('%s reads as empty', (_, raw) => {
    expect(parsePicks(raw)).toEqual([])
  })

  test('keeps only the two fields', () => {
    expect(parsePicks(JSON.stringify([{ ...pick(1), extra: true }]))).toEqual([pick(1)])
  })
})

describe('RecentPicks', () => {
  test('pushes to the front, de-duplicates by parcel, keeps 5', () => {
    const storage = memoryStorage()
    const picks = new RecentPicks(storage, fakeUser('user-a'))
    const listener = vi.fn()
    picks.subscribe(listener)

    for (const n of [1, 2, 3]) picks.push(pick(n))
    picks.push({ parcelId: 'p1', formattedAddress: '1 Fixture Way (new)' })
    expect(picks.get().map((p) => p.parcelId)).toEqual(['p1', 'p3', 'p2'])
    expect(picks.get()[0]?.formattedAddress).toBe('1 Fixture Way (new)')

    for (const n of [4, 5, 6, 7]) picks.push(pick(n))
    expect(picks.get().map((p) => p.parcelId)).toEqual(['p7', 'p6', 'p5', 'p4', 'p1'])
    expect(picks.get()).toHaveLength(MAX_RECENT_PICKS)
    expect(parsePicks(storage.data[KEY_A] ?? null)).toEqual(picks.get())
    expect(listener).toHaveBeenCalledTimes(8)
  })

  test('pushing the front entry again changes nothing', () => {
    const picks = new RecentPicks(memoryStorage(), fakeUser('user-a'))
    picks.push(pick(1))
    const before = picks.get()
    const listener = vi.fn()
    picks.subscribe(listener)
    picks.push(pick(1))
    expect(picks.get()).toBe(before)
    expect(listener).not.toHaveBeenCalled()
  })

  test("users don't see each other's picks", () => {
    const storage = memoryStorage({ [KEY_B]: JSON.stringify([pick(9)]) })
    const user = fakeUser('user-a')
    const picks = new RecentPicks(storage, user)
    picks.push(pick(1))
    expect(picks.get()).toEqual([pick(1)])

    const listener = vi.fn()
    picks.subscribe(listener)
    user.signIn('user-b')
    expect(picks.get()).toEqual([pick(9)])
    expect(listener).toHaveBeenCalledOnce()
    expect(parsePicks(storage.data[KEY_A] ?? null)).toEqual([pick(1)])
  })

  test('no user: empty, and nothing is stored', () => {
    const storage = memoryStorage()
    const picks = new RecentPicks(storage, fakeUser(null))
    picks.push(pick(1))
    expect(picks.get()).toEqual([])
    expect(storage.data).toEqual({})
  })

  test("clear removes only the signed-in user's key", () => {
    const storage = memoryStorage({
      [KEY_A]: JSON.stringify([pick(1)]),
      [KEY_B]: JSON.stringify([pick(2)]),
    })
    const picks = new RecentPicks(storage, fakeUser('user-a'))
    picks.clear()
    expect(picks.get()).toEqual([])
    expect(storage.data).toEqual({ [KEY_B]: JSON.stringify([pick(2)]) })
  })

  test('storage that throws on every call: works in memory', () => {
    const throwing: PicksStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
      removeItem: () => {
        throw new Error('blocked')
      },
    }
    const picks = new RecentPicks(throwing, fakeUser('user-a'))
    expect(picks.get()).toEqual([])
    picks.push(pick(1))
    expect(picks.get()).toEqual([pick(1)])
    picks.clear()
    expect(picks.get()).toEqual([])
  })

  test('a window whose localStorage getter throws', () => {
    const win = {
      get localStorage(): Storage {
        throw new Error('SecurityError')
      },
    } as unknown as Window
    const picks = RecentPicks.fromWindow(fakeUser('user-a'), win)
    picks.push(pick(1))
    expect(picks.get()).toEqual([pick(1)])
  })

  test('malformed stored data reads as empty, and the next pick overwrites it', () => {
    const storage = memoryStorage({ [KEY_A]: 'not json' })
    const picks = new RecentPicks(storage, fakeUser('user-a'))
    expect(picks.get()).toEqual([])
    picks.push(pick(1))
    expect(storage.data[KEY_A]).toBe(JSON.stringify([pick(1)]))
  })

  test('another tab picking, and another tab signing out', () => {
    const storage = memoryStorage()
    const picks = new RecentPicks(storage, fakeUser('user-a'))
    const win = new EventTarget() as Window
    picks.start(win)
    const listener = vi.fn()
    picks.subscribe(listener)

    storage.data[KEY_A] = JSON.stringify([pick(1)])
    win.dispatchEvent(new StorageEvent('storage', { key: KEY_A }))
    expect(picks.get()).toEqual([pick(1)])
    expect(listener).toHaveBeenCalledOnce()

    // Another user's key, or an unrelated one, is ignored.
    storage.data[KEY_B] = JSON.stringify([pick(2)])
    win.dispatchEvent(new StorageEvent('storage', { key: KEY_B }))
    win.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(listener).toHaveBeenCalledOnce()

    // Sign-out in another tab removes the key.
    delete storage.data[KEY_A]
    win.dispatchEvent(new StorageEvent('storage', { key: KEY_A }))
    expect(picks.get()).toEqual([])
    expect(listener).toHaveBeenCalledTimes(2)
  })

  test('storage cleared in another tab (key null)', () => {
    const storage = memoryStorage({ [KEY_A]: JSON.stringify([pick(1)]) })
    const picks = new RecentPicks(storage, fakeUser('user-a'))
    const win = new EventTarget() as Window
    picks.start(win)
    delete storage.data[KEY_A]
    win.dispatchEvent(new StorageEvent('storage', { key: null }))
    expect(picks.get()).toEqual([])
  })
})
