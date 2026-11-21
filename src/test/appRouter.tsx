// Test helper: the app's real route table against a memory history, with a
// signed-in fake auth and a transport that records every call.
import { createRouterTransport, type Transport } from '@connectrpc/connect'
import { TransportProvider } from '@connectrpc/connect-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { createQueryClient } from '../api/queryClient.ts'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'
import type { Auth } from '../auth.ts'
import { DefinitionChoice } from '../neighborhoodDefinition.ts'
import { createAppRouter } from '../router.tsx'
import { RecentPicks } from '../search/recentPicks.ts'

export function signedInAuth(): Auth {
  return {
    getIdToken: vi.fn(() => Promise.resolve('id-token')),
    signIn: vi.fn(() => new Promise<never>(() => {})),
    clearAndSignIn: vi.fn(() => new Promise<never>(() => {})),
    signOut: vi.fn(() => new Promise<never>(() => {})),
    onSignOut: vi.fn(() => () => {}),
    subscribe: () => () => {},
    getUser: () => null,
  } as unknown as Auth
}

/** A transport that fails every call, for tests that expect no API calls. */
export function noCallsTransport(): { transport: Transport; calls: string[] } {
  const calls: string[] = []
  const transport = createRouterTransport(() => {}, {
    transport: {
      interceptors: [
        (next) => (req) => {
          calls.push(`${req.service.typeName}/${req.method.name}`)
          return next(req)
        },
      ],
    },
  })
  return { transport, calls }
}

/** Calls other than the definitions every signed-in page loads on app load. */
export function recordCalls(calls: readonly string[]): string[] {
  return calls.filter((call) => !call.endsWith('/GetNeighborhoodDefinitions'))
}

export async function renderApp(
  path: string,
  transport: Transport = noCallsTransport().transport,
) {
  // The app's cache policy, without retries, so failures show at once.
  const auth = signedInAuth()
  const queryClient = createQueryClient(auth)
  queryClient.setDefaultOptions({
    ...queryClient.getDefaultOptions(),
    queries: { ...queryClient.getDefaultOptions().queries, retry: false },
  })
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAppRouter(
    {
      config: {
        gatewayUrl: 'http://gateway.test',
        clientId: 'record-keeper-test',
        basemapStyleUrl: 'http://basemap.test/style.json',
      },
      instance: {
        authIssuerUrl: 'http://issuer.test',
        metadata: { bounds: { west: -140, south: -40, east: -139.99, north: -39.99 } },
      },
      auth,
      transport,
      queryClient,
      definitionChoice: new DefinitionChoice(null),
      recentPicks: new RecentPicks(null, auth),
    },
    history,
  )
  await act(() => router.load())
  const view = render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </TransportProvider>,
  )
  return { router, history, queryClient, view }
}
