// Test helper: the app's real route table against a memory history, with a
// signed-in fake auth and a transport that records every call.
import { createRouterTransport, type Transport } from '@connectrpc/connect'
import { TransportProvider } from '@connectrpc/connect-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createMemoryHistory, RouterProvider } from '@tanstack/react-router'
import { act, render } from '@testing-library/react'
import { vi } from 'vitest'
import type { Auth } from '../auth.ts'
import { createAppRouter } from '../router.tsx'

export function signedInAuth(): Auth {
  return {
    getIdToken: vi.fn(() => Promise.resolve('id-token')),
    signIn: vi.fn(() => new Promise<never>(() => {})),
    clearAndSignIn: vi.fn(() => new Promise<never>(() => {})),
    signOut: vi.fn(() => new Promise<never>(() => {})),
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

export async function renderApp(
  path: string,
  transport: Transport = noCallsTransport().transport,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const history = createMemoryHistory({ initialEntries: [path] })
  const router = createAppRouter(
    { auth: signedInAuth(), transport, queryClient },
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
