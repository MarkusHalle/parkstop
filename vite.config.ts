import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import { VitePWA } from 'vite-plugin-pwa'
import { readdirSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { hu } from './src/i18n/hu.ts'

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

// The developer spike pages in public/spikes/ (English test pages, D37) stay in the repository
// and in the dev server, but are not published: remove them from the build output (D47).
function dropSpikes(): Plugin {
  let outDir = 'dist'
  return {
    name: 'parkstop-drop-spikes',
    apply: 'build',
    configResolved(config) { outDir = resolve(config.root, config.build.outDir) },
    closeBundle() { removeTree(resolve(outDir, 'spikes')) },
  }
}

// fs.rmSync({ recursive: true }) silently leaves the folder on Windows under a path with
// accented letters (seen with Node 25 here), so delete file by file.
function removeTree(dir: string) {
  let entries
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return }
  for (const e of entries) {
    const p = resolve(dir, e.name)
    if (e.isDirectory()) removeTree(p)
    else unlinkSync(p)
  }
  rmdirSync(dir)
}

// Installable app (SPEC 4.8). Precache = the app shell only. The plate models and the ONNX
// runtime (public/models, public/vendor) are not precached: the plate worker keeps them in
// its own Cache Storage entry after the user opts in (D37), and no route here touches them.
// Tiles and Nominatim have no route either, so they always go to the network.
// start_url and scope are relative, so the app also works under a GitHub Pages sub-path.
function pwa(): Plugin[] {
  return VitePWA({
    registerType: 'prompt',
    injectRegister: false,
    manifest: {
      name: 'ParkStop',
      short_name: 'ParkStop',
      lang: 'hu',
      description: hu.tagline,
      display: 'standalone',
      start_url: '.',
      scope: './',
      theme_color: '#1c1c1c',
      background_color: '#efeee9',
      icons: [
        { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{html,js,mjs,css,woff2,png,svg,json,geojson,webmanifest}'],
      globIgnores: ['models/**', 'vendor/**', 'spikes/**'],
      // The main bundle is ~1.6 MB; Workbox's 2 MiB default would silently drop it from the
      // precache (offline start breaks) if it grew a little. 4 MiB leaves room.
      maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      cleanupOutdatedCaches: true,
      navigateFallback: 'index.html',
      navigateFallbackDenylist: [/\/models\//, /\/vendor\//, /\/spikes\//],
    },
  })
}

// `npm run dev:lan` runs with --mode lan: reachable on the local network over
// self-signed HTTPS. HTTPS is required there because phones only expose the
// share sheet, geolocation and service workers on secure origins.
export default defineConfig(({ mode }) => {
  const lan = mode === 'lan'
  const https = lan
  return {
    base: process.env.BASE_PATH ?? '/',
    plugins: [react(), maplibreWorker(), dropSpikes(), pwa(), ...(https ? [basicSsl()] : [])],
    server: lan ? { host: '0.0.0.0' } : {},
    preview: lan ? { host: '0.0.0.0' } : {},
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
    },
  }
})
