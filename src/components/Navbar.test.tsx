import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import type { User } from 'oidc-client-ts'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userDisplayName } from '../auth.ts'
import { Navbar } from './Navbar.tsx'

afterEach(cleanup)

function userWith(profile: Record<string, unknown>): User {
  return { profile: { sub: 'subject-1', ...profile } } as unknown as User
}

describe('userDisplayName', () => {
  test.each([
    [{ name: 'Dev User', preferred_username: 'dev', email: 'dev@example.com' }, 'Dev User'],
    [{ preferred_username: 'dev', email: 'dev@example.com' }, 'dev'],
    [{ name: ' ', email: 'dev@example.com' }, 'dev@example.com'],
    [{}, 'subject-1'],
  ])('%o → %s', (profile, expected) => {
    expect(userDisplayName(userWith(profile))).toBe(expected)
  })
})

function fakeAuth(user: User | null) {
  const listeners = new Set<() => void>()
  let current = user
  return {
    subscribe: (l: () => void) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    getUser: () => current,
    signOut: vi.fn(() => new Promise<never>(() => {})),
    setUser(next: User | null) {
      current = next
      for (const l of listeners) l()
    },
  }
}

async function renderNavbar(auth: ReturnType<typeof fakeAuth>) {
  const rootRoute = createRootRoute({ component: () => <Navbar auth={auth} /> })
  const parcels = createRoute({ getParentRoute: () => rootRoute, path: 'parcels' })
  const router = createRouter({
    routeTree: rootRoute.addChildren([parcels]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(() => router.load())
  render(<RouterProvider router={router} />)
  await screen.findByRole('navigation')
}

describe('Navbar', () => {
  test('the app name links to /parcels', async () => {
    await renderNavbar(fakeAuth(userWith({ name: 'Dev User' })))
    expect(
      screen.getByRole('link', { name: 'Record Keeper' }).getAttribute('href'),
    ).toBe('/parcels')
  })

  test("shows the user's name, and follows changes to the stored user", async () => {
    const auth = fakeAuth(userWith({ name: 'Dev User' }))
    await renderNavbar(auth)
    expect(screen.getByText('Dev User')).toBeDefined()
    act(() => auth.setUser(userWith({ name: 'Renamed' })))
    expect(screen.getByText('Renamed')).toBeDefined()
  })

  test('"Sign out" is a button that signs out', async () => {
    const auth = fakeAuth(userWith({ name: 'Dev User' }))
    await renderNavbar(auth)
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalledOnce()
  })
})
