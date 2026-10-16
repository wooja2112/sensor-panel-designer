import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
  optimizeDeps: {
    // jszip is only ever reached via a dynamic import() inside the export
    // flow, so Vite's scanner won't always pick it up at cold start —
    // forcing it into the initial pre-bundle avoids a mid-session
    // re-optimize (and the stale-module-hash fetch error that causes).
    include: ['jszip'],
  },
})
