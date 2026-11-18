import './stylex.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Root } from './Root.tsx'

const container = document.getElementById('root')
if (!container) throw new Error('missing #root element')

createRoot(container).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
