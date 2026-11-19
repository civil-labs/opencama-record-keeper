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
    // styles (spec: Styling). The image's nginx.conf sends the same policy,
    // so a violation shows in the browser console here as it would there.
    headers: {
      'Content-Security-Policy':
        "script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'none'",
    },
  },
  test: { environment: 'jsdom', setupFiles: ['src/test/setup.ts'] },
})
