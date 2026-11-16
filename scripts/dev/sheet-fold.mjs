// Phone sheet fold check (roadmap 6.14). See README.md.
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const mode = process.argv[2] ?? 'pin'
const out = 'test-results-e2e/dev'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
// Wait for the fold's spring to finish (its overlay is removed then) rather than a fixed time:
// with software WebGL frames are slow and the spring runs slower than the clock.
const settled = () => page.waitForFunction(() => !document.querySelector('.sheet-morph'), null, { timeout: 8000 })
  .then(() => page.waitForTimeout(100), () => {})
await page.goto(process.env.DEV_URL ?? 'http://localhost:5173/')
await page.waitForSelector('#ps-search-input', { timeout: 20000 })
if (mode === 'pin') {
  await page.fill('#ps-search-input', 'Hunyadi tér')
  await page.press('#ps-search-input', 'Enter')
  await page.waitForSelector('.ps-search__hit', { timeout: 15000 })
  await page.locator('.ps-search__hit').first().click()
}
await page.waitForSelector('.sheet .title', { timeout: 15000 })
await page.waitForTimeout(2500)
const sheetH = async () => Math.round((await page.locator('.sheet').boundingBox()).height)
const g = await page.locator('.sheet-handle').boundingBox()
const x = g.x + g.width / 2, y = g.y + g.height / 2
const full = await sheetH()
const clip = { x: 0, y: 812 - full - 20, width: 375, height: full + 20 }
await page.mouse.move(x, y)
await page.mouse.down()
for (const f of [0.25, 0.5, 0.75, 1]) {
  await page.mouse.move(x, y + 12 + f * (full - 150), { steps: 6 })
  await page.waitForTimeout(150)
  await page.screenshot({ path: `${out}/fold-${mode}-${f * 100}.png`, clip })
  console.log(`drag ${f * 100} %: sheet ${await sheetH()} px`)
}
await page.mouse.up()
await settled()
const folded = await page.evaluate(() => document.querySelector('.sheet')?.classList.contains('is-folded'))
const leftover = await page.evaluate(() => !!document.querySelector('.sheet-morph'))
console.log(`released: folded ${folded}, sheet ${await sheetH()} px, morph layer left behind ${leftover}`)
await page.screenshot({ path: `${out}/fold-${mode}-folded.png`, clip })
await page.locator('.sheet-handle').click()
await page.waitForTimeout(100) // let the tap start the fold before waiting for it to end
await settled()
console.log(`tapped open: sheet ${await sheetH()} px (started at ${full})`)
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
