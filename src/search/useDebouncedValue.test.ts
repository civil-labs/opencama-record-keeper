import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { useDebouncedValue } from './useDebouncedValue.ts'

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

test('one value after a burst, 250 ms after the last change', () => {
  const { result, rerender } = renderHook(
    ({ value }) => useDebouncedValue(value, 250),
    { initialProps: { value: 'fi' } },
  )
  expect(result.current).toBe('fi')

  const seen: string[] = []
  for (const value of ['fix', 'fixt', 'fixtu']) {
    rerender({ value })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    seen.push(result.current)
  }
  // Each change restarted the timer, so nothing came through.
  expect(seen).toEqual(['fi', 'fi', 'fi'])

  act(() => {
    vi.advanceTimersByTime(149)
  })
  expect(result.current).toBe('fi')
  act(() => {
    vi.advanceTimersByTime(1)
  })
  expect(result.current).toBe('fixtu')
})

test('a pending update is dropped on unmount', () => {
  const { rerender, unmount } = renderHook(
    ({ value }) => useDebouncedValue(value, 250),
    { initialProps: { value: 'a' } },
  )
  rerender({ value: 'b' })
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
