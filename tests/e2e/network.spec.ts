// SPEC 10 / criteria 7 and 11: only the app's own host plus tiles and Nominatim; no model
// download before the user opts in.
import { ALLOWED_HOSTS, expect, fillReport, hu, openApp, openHistory, placePinBySearch, test, toMailStep, waitForServiceWorker } from './support'

test('requests only go to the allowed hosts, and no plate model is fetched', async ({ page, net }) => {
  await openApp(page)
  await waitForServiceWorker(page) // the service worker's precache fetches are recorded too

  // Help, the privacy screen on top of it, settings, history.
  await page.getByRole('button', { name: hu.help.open, exact: true }).click()
  await expect(page.getByRole('heading', { name: hu.help.title })).toBeVisible()
  await page.getByRole('button', { name: hu.privacy.title }).first().click()
  await expect(page.getByRole('heading', { name: hu.privacy.title })).toBeVisible()
  await page.goBack()
  await page.goBack()
  await page.getByRole('button', { name: hu.nav.settings, exact: true }).click()
  await expect(page.getByRole('heading', { name: hu.settings.title })).toBeVisible()
  await page.goBack()
  await openHistory(page)
  await page.goBack()

  // A full flow with the reader off.
  await placePinBySearch(page)
  await fillReport(page)
  await toMailStep(page)
  await page.getByRole('button', { name: hu.mail.open }).click()
  await expect(page.getByText(hu.done.title).first()).toBeVisible()

  await page.waitForLoadState('networkidle')

  expect(net.blocked, 'requests to a host that is not allowed').toEqual([])
  expect(net.hosts().filter((h) => !ALLOWED_HOSTS.includes(h))).toEqual([])
  // The service worker's own fetches (precache) were seen and are covered by the check above.
  expect(net.swUrls.length).toBeGreaterThan(0)
  // The mocked third parties were really used, so the allow-list is not vacuous.
  expect(net.hosts()).toEqual(expect.arrayContaining(['localhost:5190', 'nominatim.openstreetmap.org']))
  // No plate-reader files (models, ONNX runtime) before the opt-in.
  expect(net.urls.filter((u) => /\/(models|vendor)\//.test(new URL(u).pathname))).toEqual([])
})
