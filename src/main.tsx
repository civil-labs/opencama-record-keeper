import './stylex.css'
import { RouterProvider } from '@tanstack/react-router'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchInstanceMetadata } from './api/instance.ts'
import { createTransport } from './api/transport.ts'
import { Auth } from './auth.ts'
import { ErrorAlert } from './components/ErrorAlert.tsx'
import { loadConfig } from './config.ts'
import { createAppRouter } from './router.tsx'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root element')
const root = createRoot(container)

function render(node: ReactNode) {
  root.render(<StrictMode>{node}</StrictMode>)
}

// Startup: config → instance metadata → auth → transport → router. A failure here is shown
// on the page; there's nothing else to render without them.
async function start() {
  const config = await loadConfig()
  const instance = await fetchInstanceMetadata(config.gatewayUrl)
  const auth = Auth.create(instance.authIssuerUrl, config.clientId)
  await auth.start()
  const transport = createTransport(config.gatewayUrl, auth)
  const router = createAppRouter({ auth, transport })
  render(<RouterProvider router={router} />)
}

start().catch((error: unknown) => {
  console.error(error)
  render(<ErrorAlert error={error} />)
})
