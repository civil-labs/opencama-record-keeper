// The selected neighborhood definition (spec: Neighborhood definition
// selector): a viewing preference, kept in memory and mirrored to
// localStorage so it survives reloads and new tabs, and followed across tabs.
// Not in the URL: the parcel URL stays the record's shareable identity.

export const STORAGE_KEY = 'recordKeeper.neighborhoodDefinitionId'

/** The part of localStorage the store uses. */
export type ChoiceStorage = Pick<Storage, 'getItem' | 'setItem'>

/**
 * The definition to read parcels under: the stored choice if it still
 * exists, else the first by name. Undefined when there are no definitions.
 */
export function selectDefinition(
  stored: string | null,
  definitions: Readonly<Record<string, { name: string }>> | undefined,
): string | undefined {
  if (!definitions) return undefined
  if (stored !== null && Object.hasOwn(definitions, stored)) return stored
  return sortedDefinitions(definitions)[0]?.id
}

/** Definitions as `{ id, name }`, sorted by name. */
export function sortedDefinitions(
  definitions: Readonly<Record<string, { name: string }>>,
): { id: string; name: string }[] {
  return Object.entries(definitions)
    .map(([id, { name }]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
}

/**
 * The user's stored choice. Only a choice the user makes is stored, so the
 * default can follow the definitions as they change. Every storage access is
 * guarded: without storage (private mode, blocked site data) the choice lives
 * in memory for the session.
 */
export class DefinitionChoice {
  private readonly storage: ChoiceStorage | null
  private stored: string | null
  private readonly listeners = new Set<() => void>()

  constructor(storage: ChoiceStorage | null) {
    this.storage = storage
    this.stored = this.read()
  }

  /** Uses window.localStorage, if the browser allows it. */
  static fromWindow(win: Window = window): DefinitionChoice {
    let storage: ChoiceStorage | null = null
    try {
      storage = win.localStorage
    } catch {
      // Accessing localStorage itself throws when site data is blocked.
    }
    return new DefinitionChoice(storage)
  }

  private read(): string | null {
    try {
      return this.storage?.getItem(STORAGE_KEY) ?? null
    } catch {
      return null
    }
  }

  /** Follows changes made in other tabs. */
  start(win: Pick<Window, 'addEventListener'>) {
    win.addEventListener('storage', (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return
      const next = this.read()
      if (next !== this.stored) {
        this.stored = next
        this.notify()
      }
    })
  }

  /** The stored choice, for useSyncExternalStore and loaders. */
  get = (): string | null => this.stored

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  set(id: string) {
    if (id === this.stored) return
    this.stored = id
    try {
      this.storage?.setItem(STORAGE_KEY, id)
    } catch {
      // Kept in memory only.
    }
    this.notify()
  }

  private notify() {
    for (const listener of this.listeners) listener()
  }
}
