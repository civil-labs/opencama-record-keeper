import type { User } from 'oidc-client-ts'
import { describe, expect, test } from 'vitest'
import {
  DEFAULT_RETURN_TO,
  hasValidIdToken,
  jwtExpiry,
  safeReturnTo,
} from './auth.ts'

function base64url(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fakeJwt(claims: Record<string, unknown>): string {
  return `${base64url('{"alg":"none"}')}.${base64url(JSON.stringify(claims))}.sig`
}

function userWith(idToken: string | undefined): User {
  return { id_token: idToken } as User
}

describe('jwtExpiry', () => {
  test('reads exp', () => {
    expect(jwtExpiry(fakeJwt({ exp: 1234 }))).toBe(1234)
  })
  test.each([
    ['no payload', 'abc'],
    ['bad base64', 'a.!!!.c'],
    ['payload not JSON', `a.${base64url('nope')}.c`],
    ['no exp', fakeJwt({ sub: 'x' })],
    ['non-numeric exp', fakeJwt({ exp: '1234' })],
  ])('returns null for %s', (_name, token) => {
    expect(jwtExpiry(token)).toBeNull()
  })
})

describe('hasValidIdToken', () => {
  const now = 1_000_000
  test('valid when the ID token expires after the skew', () => {
    expect(hasValidIdToken(userWith(fakeJwt({ exp: now + 60 })), now)).toBe(true)
  })
  test('expired within the 30 s skew', () => {
    expect(hasValidIdToken(userWith(fakeJwt({ exp: now + 10 })), now)).toBe(false)
  })
  test('expired', () => {
    expect(hasValidIdToken(userWith(fakeJwt({ exp: now - 1 })), now)).toBe(false)
  })
  test('no user or no ID token', () => {
    expect(hasValidIdToken(null, now)).toBe(false)
    expect(hasValidIdToken(userWith(undefined), now)).toBe(false)
  })
})

describe('safeReturnTo', () => {
  test('keeps a same-origin path', () => {
    expect(safeReturnTo({ returnTo: '/parcels/abc?x=1#y' })).toBe('/parcels/abc?x=1#y')
  })
  test.each([
    ['no state', undefined],
    ['no returnTo', {}],
    ['absolute URL', { returnTo: 'https://evil.example/' }],
    ['protocol-relative', { returnTo: '//evil.example/' }],
    ['backslash trick', { returnTo: '/\\evil.example/' }],
    ['non-string', { returnTo: 7 }],
  ])('falls back for %s', (_name, state) => {
    expect(safeReturnTo(state)).toBe(DEFAULT_RETURN_TO)
  })
})
