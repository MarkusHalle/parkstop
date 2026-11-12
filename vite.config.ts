import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// MapLibre GL v6 runs its tiles in a module worker loaded from a separate file. Vite's dev
// server rewrites that file (it injects its client), which breaks it inside a worker, and
// the build would not copy it. Serve the untouched file at <base>maplibre-gl-worker.mjs in
// dev and emit it unchanged in the build; src/map/MapView.tsx points MapLibre at it.
function maplibreWorker(): Plugin {
  const file = fileURLToPath(new URL('./node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs', import.meta.url))
  const name = 'maplibre-gl-worker.mjs'
  return {
    name: 'parkstop-maplibre-worker',
    configureServer(server) {
      server.middlewares.use(`${server.config.base}${name}`, (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript')
        res.end(readFileSync(file))
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: name, source: readFileSync(file) })
    },
  }
}

// `npm run dev:lan` runs with --mode lan: reachable on the local network over
// self-signed HTTPS. HTTPS is required there because phones only expose the
// share sheet, geolocation and service workers on secure origins.
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan'
  const https = lan
  return {
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), maplibreWorker(), ...(https ? [basicSsl()] : [])],
    server: lan ? { host: '0.0.0.0' } : {},
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    },
  }
})
