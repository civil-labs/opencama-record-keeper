import { describe, expect, test, vi } from 'vitest'
import {
  DefinitionChoice,
  selectDefinition,
  sortedDefinitions,
  STORAGE_KEY,
  type ChoiceStorage,
} from './neighborhoodDefinition.ts'

const DEFINITIONS = {
  b: { name: 'Market areas' },
  a: { name: 'Districts' },
}

describe('selectDefinition', () => {
  test('a stored choice that still exists', () => {
    expect(selectDefinition('b', DEFINITIONS)).toBe('b')
  })
  test('a stored choice that no longer exists: the first by name', () => {
    expect(selectDefinition('gone', DEFINITIONS)).toBe('a')
  })
  test('no stored choice: the first by name', () => {
    expect(selectDefinition(null, DEFINITIONS)).toBe('a')
  })
  test('no definitions, or none loaded', () => {
    expect(selectDefinition('a', {})).toBeUndefined()
    expect(selectDefinition('a', undefined)).toBeUndefined()
  })
})

test('sortedDefinitions sorts by name', () => {
  expect(sortedDefinitions(DEFINITIONS).map((d) => d.id)).toEqual(['a', 'b'])
})

function memoryStorage(initial: Record<string, string> = {}): ChoiceStorage & {
  data: Record<string, string>
} {
  const data = { ...initial }
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value
    },
  }
}

describe('DefinitionChoice', () => {
  test('reads the stored choice, and stores a new one', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'b' })
    const choice = new DefinitionChoice(storage)
    expect(choice.get()).toBe('b')
    const listener = vi.fn()
    choice.subscribe(listener)
    choice.set('a')
    expect(choice.get()).toBe('a')
    expect(storage.data[STORAGE_KEY]).toBe('a')
    expect(listener).toHaveBeenCalledOnce()
  })

  test('storage that throws on read and write: works in memory', () => {
    const throwing: ChoiceStorage = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    }
    const choice = new DefinitionChoice(throwing)
    expect(choice.get()).toBeNull()
    choice.set('a')
    expect(choice.get()).toBe('a')
  })

  test('a window whose localStorage getter throws', () => {
    const win = {
      get localStorage(): Storage {
        throw new Error('SecurityError')
      },
    } as unknown as Window
    const choice = DefinitionChoice.fromWindow(win)
    choice.set('a')
    expect(choice.get()).toBe('a')
  })

  test('another tab changing the choice updates this one', () => {
    const storage = memoryStorage({ [STORAGE_KEY]: 'a' })
    const choice = new DefinitionChoice(storage)
    const win = new EventTarget() as Window
    choice.start(win)
    const listener = vi.fn()
    choice.subscribe(listener)

    storage.data[STORAGE_KEY] = 'b'
    win.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'b' }))
    expect(choice.get()).toBe('b')
    expect(listener).toHaveBeenCalledOnce()

    win.dispatchEvent(new StorageEvent('storage', { key: 'something-else' }))
    expect(listener).toHaveBeenCalledOnce()
  })
})
