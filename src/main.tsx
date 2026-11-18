import './stylex.css'
import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { fetchInstanceMetadata } from './api/instance.ts'
import { ErrorAlert } from './components/ErrorAlert.tsx'
import { loadConfig } from './config.ts'
import { Root } from './Root.tsx'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root element')
const root = createRoot(container)

function render(node: ReactNode) {
  root.render(<StrictMode>{node}</StrictMode>)
}

// Startup: config → instance metadata → app. A failure here is shown on the
// page; there's nothing else to render without them.
async function start() {
  const config = await loadConfig()
  await fetchInstanceMetadata(config.gatewayUrl)
  render(<Root />)
}

start().catch((error: unknown) => {
  console.error(error)
  render(<ErrorAlert error={error} />)
})
