// Main flow (SPEC 3): pin -> authority -> report form -> e-mail hand-off -> history.
import { DISTRICT_1, ADDRESS, PLATE, expect, fillReport, hu, openApp, openHistory, placePinBySearch, test, toMailStep } from './support'
import violationsData from '../../src/data/violations.json' with { type: 'json' }

const jarda = { sentence: violationsData.violations.find((v) => v.id === 'jarda')!.sentence!.replace(/[.]$/, '') }

test('pin, authority, report, mailto hand-off and history', async ({ page }) => {
  await openApp(page)
  await placePinBySearch(page)

  // The authority card names the reviewed authority for P01 (district-01, "biztos").
  await expect(page.getByText(hu.authority.confidence.biztos).first()).toBeVisible()

  await fillReport(page)
  await toMailStep(page)

  // The e-mail step shows recipient, subject and body.
  await expect(page.getByText(DISTRICT_1.email, { exact: true })).toBeVisible()
  const subject = hu.mailTemplate.subjectA(PLATE, ADDRESS)
  await expect(page.getByText(subject, { exact: true })).toBeVisible()
  await expect(page.locator('pre.mail-text')).toContainText(jarda.sentence)

  await page.getByRole('button', { name: hu.mail.open }).click()
  await expect(page.getByRole('heading', { name: hu.done.title }).or(page.getByText(hu.done.title).first())).toBeVisible()

  // The mailto: link that was handed to the system.
  const links = await page.evaluate(() => (window as unknown as { __mailto: string[] }).__mailto)
  expect(links).toHaveLength(1)
  const href = links[0]
  const m = /^mailto:([^?]*)\?subject=([^&]*)(?:&body=(.*))?$/s.exec(href)
  expect(m, href).not.toBeNull()
  expect(decodeURIComponent(m![1])).toBe(DISTRICT_1.email)
  expect(decodeURIComponent(m![2])).toBe(subject)
  const body = decodeURIComponent(m![3] ?? '')
  expect(body).toContain(hu.mailTemplate.greeting(DISTRICT_1.name))
  expect(body).toMatch(new RegExp(String.raw`${hu.mailTemplate.labelPlate}\s+${PLATE}`))
  expect(body).toContain(jarda.sentence)
  expect(body).toContain(ADDRESS)
  // Accented Hungarian letters survive the percent-encoding (UTF-8, not mojibake).
  expect(body).toContain('Szabálytalanság:')
  expect(body).not.toMatch(/Ã|Å|�/)
  expect(href).toContain('%C3%A1') // á as UTF-8

  // History lists the report as handed over.
  await page.getByRole('button', { name: hu.done.newReport }).click()
  await openHistory(page)
  const row = page.locator('.history-row').first()
  await expect(row).toContainText(PLATE)
  await expect(row).toContainText(hu.history.status.handed)
  await expect(row).toContainText(DISTRICT_1.name)
})
