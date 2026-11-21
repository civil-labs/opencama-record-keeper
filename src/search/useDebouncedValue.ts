import { useEffect, useState } from 'react'

/**
 * `value`, once it has stopped changing for `ms` milliseconds (spec:
 * Calling). The input shows every keystroke; only what's searched lags.
 */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}
