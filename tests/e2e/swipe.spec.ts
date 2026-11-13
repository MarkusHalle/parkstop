// Swipe between the steps on the phone (roadmap 6.7): left = next step when allowed, otherwise
// the screen springs back and the missing fields are marked; right = the step before.
import type { Page } from '@playwright/test'
import { PHOTO, PLATE, expect, hu, isPhone, openApp, placePinBySearch, test } from './support'

/** A one-finger sideways drag made of touch pointer events (what a phone sends). */
async function swipe(page: Page, selector: string, from: number, to: number, opts: { release?: boolean } = {}) {
  await page.evaluate(async ({ selector, from, to, release }) => {
    const el = document.querySelector(selector)
    if (!el) throw new Error(`no ${selector}`)
    const ev = (type: string, x: number) => el.dispatchEvent(new PointerEvent(type,
      { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 600, bubbles: true }))
    ev('pointerdown', from)
    for (let i = 1; i <= 8; i++) {
      await new Promise((r) => setTimeout(r, 16))
      ev('pointermove', from + ((to - from) * i) / 8)
    }
    if (release) ev('pointerup', to)
  }, { selector, from, to, release: opts.release ?? true })
}

const reportHeading = (page: Page) => page.getByRole('heading', { name: hu.report.title })
const mailHeading = (page: Page) => page.getByRole('heading', { name: hu.mail.title })

test('swipe moves between the steps and resists while a field is missing', async ({ page }, info) => {
  test.skip(!isPhone(page), 'swiping is a phone gesture')
  await openApp(page)
  await placePinBySearch(page)

  // Step 1 → 2: swipe the sheet left. The page follows the finger; the report header peeks in.
  await swipe(page, '.sheet-body', 300, 140, { release: false })
  await page.screenshot({ path: info.outputPath('mid-swipe-forward.png') })
  await expect(page.locator('.page-peek')).toBeVisible()
  await page.evaluate(() => document.querySelector('.sheet-body')!.dispatchEvent(new PointerEvent('pointerup',
    { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 140, clientY: 600, bubbles: true })))
  await expect(reportHeading(page)).toBeVisible()
  await expect(page.locator('.sheet')).toHaveCSS('transform', 'none')

  // Nothing filled in: the swipe springs back and the missing fields are marked.
  await swipe(page, '.app-phone > .page .page-body', 300, 100)
  await expect(page.getByText(hu.report.errors.plate).first()).toBeVisible()
  await expect(reportHeading(page)).toBeVisible()
  await expect(page.locator('.app-phone > .page')).toHaveCSS('transform', 'none')

  // Filled in: step 2 → 3.
  await page.locator('input[type=file][multiple]').setInputFiles(PHOTO)
  await page.getByRole('button', { name: hu.plate.optInNo }).click()
  await page.getByLabel(hu.report.plate, { exact: true }).fill(PLATE)
  await page.getByLabel(hu.report.violation).selectOption('jarda')
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await swipe(page, '.app-phone > .page .page-body', 300, 120)
  await expect(mailHeading(page)).toBeVisible()

  // Back: 3 → 2 (the report header peeks in from the left), then 2 → 1 (the sheet shows again).
  await swipe(page, '.app-phone > .page .page-body', 60, 220, { release: false })
  await page.screenshot({ path: info.outputPath('mid-swipe-back.png') })
  await page.evaluate(() => document.querySelector('.app-phone > .page .page-body')!.dispatchEvent(new PointerEvent('pointerup',
    { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: 220, clientY: 600, bubbles: true })))
  await expect(reportHeading(page)).toBeVisible()
  await swipe(page, '.app-phone > .page .page-body', 60, 240)
  await expect(page.locator('.app-phone > .page')).toHaveCount(0)
  await expect(page.locator('.sheet')).toBeVisible()
  await expect(page.getByRole('button', { name: hu.authority.continue })).toBeVisible()
})

test('a touch that starts at the screen edge is left to the system back gesture', async ({ page }) => {
  test.skip(!isPhone(page), 'swiping is a phone gesture')
  await openApp(page)
  await placePinBySearch(page)
  await swipe(page, '.sheet-body', 10, 200)
  await swipe(page, '.sheet-body', 368, 120)
  await expect(page.locator('.app-phone > .page')).toHaveCount(0)
})
