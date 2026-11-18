import { Code, ConnectError } from '@connectrpc/connect'
import { QueryClient, QueryClientProvider, useSuspenseQuery } from '@tanstack/react-query'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { RouteError } from './RouteError.tsx'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

test('shows the Connect code and message, and Retry loads the page again', async () => {
  // The router logs a failed loader's error. Here the failure is the point of
  // the test, so capture the log instead of printing it.
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  let calls = 0
  const fetchRecord = () => {
    calls += 1
    return calls === 1
      ? Promise.reject(new ConnectError('reader down', Code.Unavailable))
      : Promise.resolve('the record')
  }
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const options = { queryKey: ['record'], queryFn: fetchRecord }
  const rootRoute = createRootRoute()
  const page = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    loader: () => queryClient.ensureQueryData(options),
    component: function Page() {
      const { data } = useSuspenseQuery(options)
      return <p>{data}</p>
    },
    errorComponent: RouteError,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([page]),
    history: createMemoryHistory({ initialEntries: ['/'] }),
  })
  await act(() => router.load())
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  expect((await screen.findByRole('alert')).textContent).toBe('Unavailable: reader down')
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  expect(await screen.findByText('the record')).toBeDefined()
  expect(calls).toBe(2)
  const logged = [...consoleError.mock.calls, ...consoleWarn.mock.calls].flat()
  expect(logged.some((arg) => arg instanceof ConnectError)).toBe(true)
})
