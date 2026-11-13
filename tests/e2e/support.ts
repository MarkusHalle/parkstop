// Shared helpers for the end-to-end specs: network mocking and recording, and the report flow.
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hu } from '../../src/i18n/hu'

export { expect, hu }

const fixture = (name: string) => fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url))
const json = (name: string) => readFileSync(fixture(name), 'utf8')

export const PHOTO = fixture('car.jpg')
export const APP_ORIGIN = 'http://localhost:5190'
/** Hosts the app may talk to (SPEC 10). */
export const ALLOWED_HOSTS = ['localhost:5190', 'tiles.openfreemap.org', 'nominatim.openstreetmap.org']

/** The reviewed fixture point P01 (Hunfalvy utca, I.): tests/fixtures/authority-test-points.json. */
export const P01 = { lat: 47.505225, lon: 19.033754 }
const authorities = JSON.parse(readFileSync(fileURLToPath(new URL('../../src/data/authorities.json', import.meta.url)), 'utf8')) as {
  authorities: { id: string; name: string; email: string }[]
}
export const DISTRICT_1 = authorities.authorities.find((a) => a.id === 'district-01')!
export const SEARCH_TEXT = 'Hunfalvy utca 3'
export const ADDRESS = 'Hunfalvy utca 3.'
export const PLATE = 'ABC-123'

export interface Net {
  /** Every request URL seen by the context: pages and service workers. */
  urls: string[]
  /** The subset made by the service worker itself (precache fetches). */
  swUrls: string[]
  /** Requests that were blocked because the host is not allowed. */
  blocked: string[]
  hosts(): string[]
}

const hostOf = (url: string) => new URL(url).host

/** Mocks tiles and Nominatim, blocks every other host, and records all requests. */
async function installNetwork(context: BrowserContext): Promise<Net> {
  const net: Net = {
    urls: [],
    swUrls: [],
    blocked: [],
    hosts: () => [...new Set(net.urls.filter((u) => /^https?:/.test(u)).map(hostOf))],
  }
  context.on('request', (r) => {
    net.urls.push(r.url())
    if (r.serviceWorker()) net.swUrls.push(r.url())
  })

  // Registered first = lowest priority: anything the specific routes below do not handle.
  await context.route(/^https?:\/\//, (route) => {
    const url = route.request().url()
    if (hostOf(url) === 'localhost:5190') return route.fallback()
    net.blocked.push(url)
    return route.abort('blockedbyclient')
  })
  await context.route('https://tiles.openfreemap.org/**', (route) => {
    const { pathname } = new URL(route.request().url())
    if (/^\/styles\/(liberty|dark)$/.test(pathname)) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: json('openfreemap-style.json') })
    }
    // An empty vector tile.
    return route.fulfill({ status: 200, contentType: 'application/x-protobuf', headers: { 'access-control-allow-origin': '*' }, body: '' })
  })
  await context.route('https://nominatim.openstreetmap.org/**', (route) => {
    const { pathname } = new URL(route.request().url())
    const body = pathname === '/search' ? json('nominatim-search.json') : pathname === '/reverse' ? json('nominatim-reverse.json') : null
    if (body === null) return route.fulfill({ status: 404, body: '' })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body })
  })

  // `mailto:` navigations go nowhere in a test browser: record the link and cancel it.
  await context.addInitScript(() => {
    const w = window as unknown as { __mailto: string[] }
    w.__mailto = []
    const nav = (window as unknown as { navigation?: EventTarget }).navigation
    nav?.addEventListener('navigate', (e) => {
      const ev = e as Event & { destination: { url: string }; canIntercept: boolean }
      if (ev.destination.url.startsWith('mailto:')) {
        w.__mailto.push(ev.destination.url)
        e.preventDefault()
      }
    })
  })
  return net
}

export const test = base.extend<{ net: Net }>({
  net: [
    async ({ context }, use) => {
      await use(await installNetwork(context))
    },
    { auto: true },
  ],
})

export const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) < 900

/** Opens the app and waits until the map has been created and the search box works. */
export async function openApp(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('searchbox', { name: hu.map.searchLabel })).toBeEnabled()
}

/** Step 1: search the fixture address and pick the hit; the authority card appears. */
export async function placePinBySearch(page: Page) {
  const box = page.getByRole('searchbox', { name: hu.map.searchLabel })
  await box.fill(SEARCH_TEXT)
  await box.press('Enter')
  await page.getByRole('button', { name: new RegExp(`^${ADDRESS}`) }).click()
  await expect(page.getByText(DISTRICT_1.name).first()).toBeVisible()
}

/** Step 2: fill the form (photo, plate, offence) and continue to the e-mail step. */
export async function fillReport(page: Page) {
  await page.getByRole('button', { name: hu.authority.continue }).click()
  await expect(page.getByRole('heading', { name: hu.report.title })).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(PHOTO)
  await expect(page.getByRole('img', { name: hu.report.photoAlt(1) })).toBeVisible()
  // The reader is not wanted in these tests; "Nem, beírom" keeps it off.
  await page.getByRole('button', { name: hu.plate.optInNo }).click()
  await page.getByLabel(hu.report.plate, { exact: true }).fill(PLATE)
  await page.getByLabel(hu.report.violation).selectOption('jarda')
}

export async function toMailStep(page: Page) {
  await page.getByRole('button', { name: hu.report.continue }).click()
  await expect(page.getByRole('heading', { name: hu.mail.title })).toBeVisible()
}

export async function openHistory(page: Page) {
  await page.getByRole('button', { name: hu.nav.history, exact: true }).click()
  await expect(page.getByRole('heading', { name: hu.history.title })).toBeVisible()
}

/** Waits until the service worker is active and controls the page (reloads once to get control). */
export async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await page.waitForFunction(() => !!navigator.serviceWorker.controller)
}
