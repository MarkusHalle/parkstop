// SPEC 11 criterion 6: with the network off the app opens, the form works, history is readable.
import { ADDRESS, DISTRICT_1, PLATE, expect, fillReport, hu, openApp, openHistory, placePinBySearch, test, toMailStep, waitForServiceWorker } from './support'

test('opens offline from the service worker, form and history work', async ({ page, context }) => {
  // Online: install the service worker and leave a draft in the history (saved when the step changes).
  await openApp(page)
  await waitForServiceWorker(page)
  await placePinBySearch(page)
  await fillReport(page)
  await toMailStep(page) // saves the draft with the plate and the offence
  // The save is asynchronous: wait until the stored draft has the plate before leaving the page
  // (on CI the reload below sometimes came first and the older copy without it was read).
  await expect.poll(() => page.evaluate(() => new Promise<string[]>((resolve) => {
    const open = indexedDB.open('parkstop')
    open.onerror = () => resolve([])
    open.onsuccess = () => {
      const get = open.result.transaction('reports').objectStore('reports').getAll()
      get.onsuccess = () => { resolve((get.result as { form?: { plate?: string } }[]).map((r) => r.form?.plate ?? '')); open.result.close() }
      get.onerror = () => { resolve([]); open.result.close() }
    }
  })), { timeout: 10_000 }).toContain(PLATE)

  await context.setOffline(true)
  await page.goto('/')
  // The app shell renders from the precache and says it is offline.
  await expect(page.locator('.brand-name').first()).toHaveText(hu.appName)
  await expect(page.getByText(hu.pwa.offline)).toBeVisible()

  // History is readable and the draft is there.
  await openHistory(page)
  const row = page.locator('.history-row').first()
  await expect(row).toContainText(hu.history.status.draft)
  await expect(row).toContainText(ADDRESS)

  // Open the draft: the form comes back and can be edited.
  await row.locator('.history-open').click()
  await expect(page.getByRole('heading', { name: hu.report.title })).toBeVisible()
  const plate = page.getByLabel(hu.report.plate, { exact: true })
  await expect(plate).toHaveValue(PLATE)
  await plate.fill('XYZ-987')
  await expect(plate).toHaveValue('XYZ-987')
  await page.getByLabel(hu.report.vehicle).fill('szürke Opel Astra')
  await page.getByLabel(hu.report.note).fill('Offline kitöltve')
  await page.getByRole('button', { name: hu.report.continue }).click()
  await expect(page.getByRole('heading', { name: hu.mail.title })).toBeVisible()
  // Scoped to the page: on the phone step 1's sheet stays mounted (hidden) under it.
  await expect(page.getByRole('main').getByText(DISTRICT_1.email, { exact: true })).toBeVisible()
})
