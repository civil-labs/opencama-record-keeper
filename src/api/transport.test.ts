import { Code, ConnectError, type UnaryRequest, type UnaryResponse } from '@connectrpc/connect'
import { describe, expect, test, vi } from 'vitest'
import { createAuthInterceptor } from './transport.ts'

function fakeAuth(token: string | null) {
  return {
    getIdToken: vi.fn(() => Promise.resolve(token)),
    clearAndSignIn: vi.fn(() => new Promise<never>(() => {})),
  }
}

function request() {
  return { header: new Headers() } as UnaryRequest
}

const response = { message: {} } as UnaryResponse

/** Resolves to 'pending' if the promise hasn't settled after a tick. */
async function settled(promise: Promise<unknown>) {
  return Promise.race([
    promise.then(() => 'resolved', () => 'rejected'),
    new Promise((r) => setTimeout(() => r('pending'), 10)),
  ])
}

describe('auth interceptor', () => {
  test('adds the ID token as a bearer token', async () => {
    const auth = fakeAuth('id-token')
    const next = vi.fn(() => Promise.resolve(response))
    const req = request()
    await createAuthInterceptor(auth, () => '/here')(next)(req)
    expect(req.header.get('Authorization')).toBe('Bearer id-token')
    expect(next).toHaveBeenCalledWith(req)
  })

  test('with no valid token, signs in without sending the request', async () => {
    const auth = fakeAuth(null)
    const next = vi.fn(() => Promise.resolve(response))
    const call = createAuthInterceptor(auth, () => '/here')(next)(request())
    expect(await settled(call)).toBe('pending')
    expect(next).not.toHaveBeenCalled()
    expect(auth.clearAndSignIn).toHaveBeenCalledWith('/here')
  })

  test('Unauthenticated clears the session and signs in again', async () => {
    const auth = fakeAuth('id-token')
    const next = vi.fn(() =>
      Promise.reject(new ConnectError('token expired', Code.Unauthenticated)),
    )
    const call = createAuthInterceptor(auth, () => '/parcels/abc')(next)(request())
    expect(await settled(call)).toBe('pending')
    expect(auth.clearAndSignIn).toHaveBeenCalledWith('/parcels/abc')
  })

  test('other errors pass through', async () => {
    const auth = fakeAuth('id-token')
    const error = new ConnectError('nope', Code.NotFound)
    const next = vi.fn(() => Promise.reject(error))
    await expect(createAuthInterceptor(auth)(next)(request())).rejects.toBe(error)
    expect(auth.clearAndSignIn).not.toHaveBeenCalled()
  })
})
