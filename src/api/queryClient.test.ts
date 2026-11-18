import { Code, ConnectError } from '@connectrpc/connect'
import { describe, expect, test, vi } from 'vitest'
import { createQueryClient, shouldRetry } from './queryClient.ts'

const err = (code: Code) => new ConnectError('x', code)

describe('shouldRetry', () => {
  test.each([Code.Unavailable, Code.DeadlineExceeded, Code.ResourceExhausted])(
    'retries %s up to 3 times',
    (code) => {
      expect(shouldRetry(0, err(code))).toBe(true)
      expect(shouldRetry(2, err(code))).toBe(true)
      expect(shouldRetry(3, err(code))).toBe(false)
    },
  )

  test.each([
    Code.Unauthenticated,
    Code.PermissionDenied,
    Code.NotFound,
    Code.InvalidArgument,
    Code.FailedPrecondition,
  ])('never retries %s', (code) => {
    expect(shouldRetry(0, err(code))).toBe(false)
  })

  test('a non-Connect error is not retried', () => {
    expect(shouldRetry(0, new Error('boom'))).toBe(false)
  })
})

describe('Unauthenticated from a query', () => {
  test('starts a sign-in returning to the current page', async () => {
    const auth = { clearAndSignIn: vi.fn(() => new Promise<never>(() => {})) }
    const queryClient = createQueryClient(auth, () => '/parcels/abc')
    await queryClient
      .fetchQuery({
        queryKey: ['x'],
        queryFn: () => Promise.reject(err(Code.Unauthenticated)),
      })
      .catch(() => {})
    expect(auth.clearAndSignIn).toHaveBeenCalledWith('/parcels/abc')
  })

  test('other errors do not', async () => {
    const auth = { clearAndSignIn: vi.fn(() => new Promise<never>(() => {})) }
    const queryClient = createQueryClient(auth)
    await queryClient
      .fetchQuery({
        queryKey: ['y'],
        queryFn: () => Promise.reject(err(Code.NotFound)),
      })
      .catch(() => {})
    expect(auth.clearAndSignIn).not.toHaveBeenCalled()
  })
})
