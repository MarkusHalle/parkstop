// Ctrl+drags right in the top and bottom half of the PC map (roadmap 6.10). See README.md.
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: true })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(process.env.DEV_URL ?? 'http://localhost:5173/')
await page.waitForSelector('.maplibregl-canvas', { timeout: 20000 })
await page.waitForTimeout(2500)
const box = await page.locator('.maplibregl-canvas').boundingBox()
const needle = () => page.evaluate(() => document.querySelector('.ps-compass__needle')?.style.transform ?? 'n/a')
async function drag(y, label) {
  const x = box.x + box.width / 2 - 100
  await page.keyboard.down('Control')
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + i * 10, y)
  await page.mouse.up()
  await page.keyboard.up('Control')
  await page.waitForTimeout(400)
  console.log(label, await needle())
}
await drag(box.y + box.height * 0.2, 'top half, drag right    -> needle')
await drag(box.y + box.height * 0.8, 'bottom half, drag right -> needle')
console.log('(needle = -bearing; angles wrap at ±180°)')
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
