import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// `npm run dev:lan` runs with --mode lan: reachable on the local network over
// self-signed HTTPS. HTTPS is required there because phones only expose the
// share sheet, geolocation and service workers on secure origins.
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan'
  const https = lan
  return {
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), ...(https ? [basicSsl()] : [])],
    server: lan ? { host: '0.0.0.0' } : {},
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    },
  }
})
