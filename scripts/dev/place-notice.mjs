// Prints the authority notice for each searched place (roadmap 6.11). See README.md.
import { chromium } from '@playwright/test'

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await page.goto('http://localhost:5173/')
await page.waitForSelector('.maplibregl-canvas', { timeout: 20000 })
for (const q of process.argv.slice(2)) {
  await page.fill('#ps-search-input', q)
  await page.press('#ps-search-input', 'Enter')
  await page.waitForSelector('.ps-search__hit', { timeout: 15000 })
  await page.locator('.ps-search__hit').first().click()
  await page.waitForTimeout(2500)
  const notice = await page.locator('.authority .notice-info').first().textContent({ timeout: 10000 }).catch(() => '(no notice)')
  console.log(`${q}  ->  ${notice}`)
}
await browser.close()
