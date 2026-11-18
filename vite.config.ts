import stylex from '@stylexjs/unplugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [stylex(), react()],
  server: { port: 3000, strictPort: true },
  preview: {
    port: 3000,
    strictPort: true,
    // The production build must run under this policy: no inline scripts or
    // styles (spec: Styling). `npm run preview` serves dist/ with it, so a
    // violation shows in the browser console. Deployment sets its own headers.
    headers: { 'Content-Security-Policy': "script-src 'self'; style-src 'self'" },
  },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'] },
})
