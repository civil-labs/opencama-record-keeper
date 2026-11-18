import stylex from '@stylexjs/unplugin/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// StyleX appends its compiled CSS to a stylesheet the bundle already has, and
// the app has no stylesheet of its own (all styles are StyleX). This virtual
// module gives the entry chunk one, so StyleX's CSS is hashed and linked from
// index.html. It's imported once, in main.tsx.
const STYLESHEET_ID = 'virtual:stylesheet'
const RESOLVED_STYLESHEET_ID = '\0stylesheet.css'

function stylesheet(): Plugin {
  return {
    name: 'record-keeper:stylesheet',
    resolveId: (id) => (id === STYLESHEET_ID ? RESOLVED_STYLESHEET_ID : null),
    load: (id) =>
      id === RESOLVED_STYLESHEET_ID ? '/* StyleX output is appended here. */\n' : null,
  }
}

export default defineConfig({
  plugins: [stylesheet(), stylex(), react()],
  server: { port: 3000, strictPort: true },
  preview: { port: 3000, strictPort: true },
  test: { environment: 'jsdom' },
})
