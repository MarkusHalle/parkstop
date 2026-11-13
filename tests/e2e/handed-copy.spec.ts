// SPEC 4.7 / D47: the first change to a handed report continues in a new draft; the handed
// record in the history stays as it was sent.
import { PLATE, expect, fillReport, hu, openApp, openHistory, placePinBySearch, test, toMailStep } from './support'

const NEW_PLATE = 'XYZ-987'

test('changing a handed report starts a new draft and keeps the handed one', async ({ page }) => {
  await openApp(page)
  await placePinBySearch(page)
  await fillReport(page)
  await toMailStep(page)
  await page.getByRole('button', { name: hu.mail.open }).click()
  await expect(page.getByText(hu.done.title).first()).toBeVisible()

  // Back to the form (done -> mail -> report) and change the plate.
  await page.goBack()
  await expect(page.getByRole('heading', { name: hu.mail.title })).toBeVisible()
  await page.goBack()
  await expect(page.getByRole('heading', { name: hu.report.title })).toBeVisible()
  const plate = page.getByLabel(hu.report.plate, { exact: true })
  await plate.fill(NEW_PLATE)
  await expect(page.getByText(hu.history.forked)).toBeVisible()
  await toMailStep(page) // saves the new draft

  // On the phone the header only works on the map: go back there first (mail -> report -> map).
  await page.goBack()
  await page.goBack()
  await openHistory(page)
  const rows = page.locator('.history-row')
  await expect(rows).toHaveCount(2)
  await expect(rows.filter({ hasText: PLATE })).toContainText(hu.history.status.handed)
  await expect(rows.filter({ hasText: NEW_PLATE })).toContainText(hu.history.status.draft)
})
