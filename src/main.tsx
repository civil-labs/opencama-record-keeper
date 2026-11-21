import './stylex.css'
import { TransportProvider } from '@connectrpc/connect-query'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type AnyRouter } from '@tanstack/react-router'
import { lazy, StrictMode, Suspense, type ComponentType, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchInstanceMetadata } from './api/instance.ts'
import { createQueryClient } from './api/queryClient.ts'
import { createTransport } from './api/transport.ts'
import { Auth } from './auth.ts'
import { ErrorAlert } from './components/ErrorAlert.tsx'
import { loadConfig } from './config.ts'
import { DefinitionChoice } from './neighborhoodDefinition.ts'
import { createAppRouter } from './router.tsx'
import { connectRecentPicks } from './search/recentPicks.ts'

// Dev builds only: import.meta.env.DEV is false in production, so the import
// and the devtools packages are dropped from the bundle. If the import fails,
// as it does when the first load redirects to sign-in mid-import, render
// nothing rather than reporting an error.
const Devtools = import.meta.env.DEV
  ? lazy<ComponentType<{ router: AnyRouter }>>(() =>
      import('./Devtools.tsx').catch(() => ({ default: () => null })),
    )
  : null

const container = document.getElementById('root')
if (!container) throw new Error('missing #root element')
const root = createRoot(container)

function render(node: ReactNode) {
  root.render(<StrictMode>{node}</StrictMode>)
}

// Startup: config → instance metadata → auth → transport and query client →
// router. A failure here is shown on the page; there's nothing else to render
// without them.
async function start() {
  const config = await loadConfig()
  const instance = await fetchInstanceMetadata(config.gatewayUrl)
  const auth = Auth.create(instance.authIssuerUrl, config.clientId)
  await auth.start()
  const transport = createTransport(config.gatewayUrl, auth)
  const queryClient = createQueryClient(auth)
  const definitionChoice = DefinitionChoice.fromWindow()
  definitionChoice.start(window)
  const recentPicks = connectRecentPicks(auth)
  const router = createAppRouter({
    config,
    instance,
    auth,
    transport,
    queryClient,
    definitionChoice,
    recentPicks,
  })
  render(
    <TransportProvider transport={transport}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        {Devtools && (
          <Suspense>
            <Devtools router={router} />
          </Suspense>
        )}
      </QueryClientProvider>
    </TransportProvider>,
  )
}

start().catch((error: unknown) => {
  console.error(error)
  render(<ErrorAlert error={error} />)
})
