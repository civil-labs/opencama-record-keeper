// The last few search hits a user picked (spec: Recent picks), shown when
// the search box is focused and empty. Kept in memory and mirrored to
// localStorage per user, keyed by the ID token's `sub`, so people sharing a
// workstation don't see each other's picks. Followed across tabs. Cleared on
// sign-out through Auth.onSignOut, wired in main.tsx.

import type { Auth } from '../auth.ts'

export const STORAGE_KEY_PREFIX = 'recordKeeper.recentPicks.'
export const MAX_RECENT_PICKS = 5

export interface RecentPick {
  parcelId: string
  formattedAddress: string
}

/** The part of localStorage the store uses. */
export type PicksStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

/** The part of Auth the store uses: who's signed in. */
export type UserSource = Pick<Auth, 'subscribe' | 'getUser'>

const EMPTY: readonly RecentPick[] = Object.freeze([])

/** The stored value, or empty if it's missing or isn't the expected shape. */
export function parsePicks(raw: string | null): readonly RecentPick[] {
  if (raw === null) return EMPTY
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return EMPTY
  }
  if (!Array.isArray(value) || value.length > MAX_RECENT_PICKS) return EMPTY
  const picks: RecentPick[] = []
  for (const item of value as unknown[]) {
    if (typeof item !== 'object' || item === null) return EMPTY
    const { parcelId, formattedAddress } = item as Record<string, unknown>
    if (typeof parcelId !== 'string' || typeof formattedAddress !== 'string') {
      return EMPTY
    }
    picks.push({ parcelId, formattedAddress })
  }
  return picks
}

export class RecentPicks {
  private readonly storage: PicksStorage | null
  private readonly user: UserSource
  private sub: string | null
  private picks: readonly RecentPick[]
  private readonly listeners = new Set<() => void>()

  constructor(storage: PicksStorage | null, user: UserSource) {
    this.storage = storage
    this.user = user
    this.sub = this.currentSub()
    this.picks = this.read()
    // Lives as long as the app, like the Auth it follows.
    user.subscribe(() => this.onUserChange())
  }

  /** Uses window.localStorage, if the browser allows it. */
  static fromWindow(user: UserSource, win: Window = window): RecentPicks {
    let storage: PicksStorage | null = null
    try {
      storage = win.localStorage
    } catch {
      // Accessing localStorage itself throws when site data is blocked.
    }
    return new RecentPicks(storage, user)
  }

  private currentSub(): string | null {
    return this.user.getUser()?.profile.sub ?? null
  }

  private key(): string | null {
    return this.sub === null ? null : STORAGE_KEY_PREFIX + this.sub
  }

  private read(): readonly RecentPick[] {
    const key = this.key()
    if (key === null) return EMPTY
    try {
      return parsePicks(this.storage?.getItem(key) ?? null)
    } catch {
      return EMPTY
    }
  }

  private onUserChange() {
    const sub = this.currentSub()
    if (sub === this.sub) return
    this.sub = sub
    this.replace(this.read())
  }

  /** Follows changes made in other tabs, including a sign-out's removal. */
  start(win: Pick<Window, 'addEventListener'>) {
    win.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== null && event.key !== this.key()) return
      this.replace(this.read())
    })
  }

  /** The picks, newest first, for useSyncExternalStore. */
  get = (): readonly RecentPick[] => this.picks

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /**
   * Moves `pick` to the front, dropping any older entry for the same parcel
   * and anything past the fifth. Does nothing when nobody is signed in.
   */
  push(pick: RecentPick) {
    const key = this.key()
    if (key === null) return
    const next = [
      { parcelId: pick.parcelId, formattedAddress: pick.formattedAddress },
      ...this.picks.filter((p) => p.parcelId !== pick.parcelId),
    ].slice(0, MAX_RECENT_PICKS)
    try {
      this.storage?.setItem(key, JSON.stringify(next))
    } catch {
      // Kept in memory only.
    }
    this.replace(next)
  }

  /** Removes the signed-in user's picks, from memory and from storage. */
  clear() {
    const key = this.key()
    if (key !== null) {
      try {
        this.storage?.removeItem(key)
      } catch {
        // Nothing stored to remove.
      }
    }
    this.replace(EMPTY)
  }

  private replace(next: readonly RecentPick[]) {
    if (samePicks(next, this.picks)) return
    this.picks = next
    for (const listener of this.listeners) listener()
  }
}

function samePicks(a: readonly RecentPick[], b: readonly RecentPick[]) {
  return (
    a.length === b.length &&
    a.every(
      (p, i) =>
        p.parcelId === b[i]?.parcelId &&
        p.formattedAddress === b[i].formattedAddress,
    )
  )
}

/**
 * The app's store: backed by localStorage, following other tabs, and
 * cleared when the user explicitly signs out (spec: Clearing on sign-out).
 * Called once at startup, after auth has loaded the user.
 */
export function connectRecentPicks(
  auth: UserSource & Pick<Auth, 'onSignOut'>,
  win: Window = window,
): RecentPicks {
  const picks = RecentPicks.fromWindow(auth, win)
  picks.start(win)
  auth.onSignOut(() => picks.clear())
  return picks
}
