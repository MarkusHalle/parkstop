// Screenshots of the capital-road band (roadmap 6.17) at fixed places and zooms, light and
// dark, phone and PC width. See README.md. Needs the dev server (the map handle is dev-only).
// Usage: node scripts/dev/capital-band.mjs [label] [--pc-only]
import { chromium } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const label = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'now'
const pcOnly = process.argv.includes('--pc-only')
const out = `${process.env.SHOT_DIR ?? 'test-results-e2e/dev'}/capital-band-${label}`
await mkdir(out, { recursive: true })
const PLACES = {
  stefania: [19.09488, 47.508453], // Stefánia út / Thököly út (XIV): the reported mismatch
  munkacsy: [19.071301, 47.514181], // Munkácsy Mihály utca: section end cut inside the street (VI)
  blaha: [19.0707, 47.4963], // Blaha Lujza tér: ring road, Rákóczi út and a square fill (VIII)
}
const ZOOMS = [12, 14, 16, 18]
const SIZES = pcOnly ? { pc: [1280, 800] } : { phone: [375, 812], pc: [1280, 800] }
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const errors = []
for (const theme of ['light', 'dark']) {
  for (const [size, [width, height]] of Object.entries(SIZES)) {
    const page = await browser.newPage({ viewport: { width, height }, colorScheme: theme, ignoreHTTPSErrors: true })
    page.on('pageerror', (e) => errors.push(e.message))
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
    await page.goto(process.env.DEV_URL ?? 'http://localhost:5173/')
    await page.waitForFunction(() => globalThis.__psMap?.getLayer('capital-roads-line'), null, { timeout: 30000 })
    const layers = await page.evaluate(() => globalThis.__psMap.getStyle().layers.filter((l) => l.id.startsWith('capital')).length)
    console.log(`${theme} ${size}: ${layers} capital layers`)
    for (const [place, center] of Object.entries(PLACES)) {
      for (const zoom of ZOOMS) {
        await page.evaluate(
          ([c, z]) =>
            new Promise((resolve) => {
              const m = globalThis.__psMap
              m.jumpTo({ center: c, zoom: z, bearing: 0, pitch: 0 })
              m.once('idle', resolve)
              setTimeout(resolve, 15000)
            }),
          [center, zoom],
        )
        await page.locator('.maplibregl-canvas').screenshot({ path: `${out}/${place}-z${zoom}-${theme}-${size}.png` })
      }
    }
    await page.close()
  }
}
console.log(`screenshots in ${out}/`)
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
