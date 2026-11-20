// Full-screen photo from a step-2 thumbnail (roadmap 6.18). See README.md.
// Map tiles and the address search are answered from tests/e2e/fixtures, so nothing leaves
// the machine. Phone (375 px, touch) and PC (1280 px, mouse): open, short drag (springs back),
// long drag (closes into the thumbnail), flick, Escape, pinch and wheel do nothing (6.29), close button, thumbnail scrolled
// away (fades), reduced motion. Prints each result; screenshots mid-animation.
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from '@playwright/test'

const out = 'test-results-e2e/dev'
mkdirSync(out, { recursive: true })
const fx = (n) => new URL(`../../tests/e2e/fixtures/${n}`, import.meta.url)
const PHOTO = fx('car.jpg').pathname
const json = (n) => readFileSync(fx(n), 'utf8')
const hdr = { 'access-control-allow-origin': '*' }
const only = process.argv[2] // phone | pc | undefined (both)

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed++ }

for (const kind of ['phone', 'pc']) {
  if (only && only !== kind) continue
  const phone = kind === 'phone'
  const ctx = await browser.newContext(phone
    ? { viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true, locale: 'hu-HU' }
    : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, ignoreHTTPSErrors: true, locale: 'hu-HU' })
  await ctx.route('https://tiles.openfreemap.org/**', (r) => /\/styles\/(liberty|dark)$/.test(new URL(r.request().url()).pathname)
    ? r.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: json('openfreemap-style.json') })
    : r.fulfill({ status: 200, contentType: 'application/x-protobuf', headers: hdr, body: '' }))
  await ctx.route('https://nominatim.openstreetmap.org/**', (r) => {
    const p = new URL(r.request().url()).pathname
    return r.fulfill({ status: 200, contentType: 'application/json', headers: hdr, body: json(p === '/search' ? 'nominatim-search.json' : 'nominatim-reverse.json') })
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()))
  // A worktree's node_modules is a link to the main checkout, outside Vite's allowed folders:
  // the dev server refuses its font files (403). Not the app's doing; other failures count.
  page.on('response', (r) => r.status() >= 400 && !r.url().includes('/@fs/') && errors.push(`http ${r.status()} ${r.url()}`))

  await page.goto(process.env.DEV_URL ?? 'http://localhost:5173/')
  await page.waitForSelector('#ps-search-input', { timeout: 20000 })
  await page.fill('#ps-search-input', 'Hunfalvy utca 3')
  await page.press('#ps-search-input', 'Enter')
  await page.locator('.ps-search__hit').first().click({ timeout: 15000 })
  await page.getByRole('button', { name: 'Bejelentés készítése' }).first().click({ timeout: 20000 })
  await page.locator('input[type=file][multiple]').setInputFiles(PHOTO)
  await page.locator('.thumb-open').first().waitFor()
  await page.waitForTimeout(800)

  const lb = () => page.evaluate(() => {
    const root = document.querySelector('.zoom-lb')
    const fly = document.querySelector('.zoom-lb-flyer')
    return {
      open: !!root,
      moving: !!fly && !fly.hasAttribute('data-off'),
      backdrop: document.querySelector('.zoom-lb-backdrop')?.style.opacity ?? null,
      thumbOpacity: document.querySelector('.thumb-open img')?.style.opacity ?? null,
    }
  })
  const settled = () => page.waitForFunction(() => {
    const fly = document.querySelector('.zoom-lb-flyer')
    return !fly || fly.hasAttribute('data-off')
  }, null, { timeout: 8000 }).then(() => page.waitForTimeout(80))
  const closed = () => page.waitForFunction(() => !document.querySelector('.zoom-lb'), null, { timeout: 8000 }).then(() => true, () => false)
  const shot = (name) => page.screenshot({ path: `${out}/zoom-${kind}-${name}.png` })
  const openZoom = async (name) => {
    await page.locator('.thumb-open').first().click()
    if (name) {
      await page.waitForTimeout(60)
      await shot(`${name}-a`)
      await shot(`${name}-b`)
    }
    await settled()
  }
  const centre = async () => {
    const b = await page.locator('.zoom-viewport').boundingBox()
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 }
  }
  /** A drag down by `dy` in `n` moves `gap` ms apart; `hold` ms still before releasing. */
  const drag = async (dy, { n = 10, gap = 24, hold = 160, release = true, snap } = {}) => {
    const c = await centre()
    if (phone) {
      const ev = (type, y, id = 9) => page.evaluate(({ type, x, y, id }) => document.querySelector('.zoom-viewport')
        .dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, bubbles: true })), { type, x: c.x, y, id })
      await ev('pointerdown', c.y)
      for (let i = 1; i <= n; i++) { await page.waitForTimeout(gap); await ev('pointermove', c.y + (dy * i) / n) }
      if (snap) await shot(snap)
      await page.waitForTimeout(hold)
      if (release) await ev('pointerup', c.y + dy)
    } else {
      await page.mouse.move(c.x, c.y)
      await page.mouse.down()
      for (let i = 1; i <= n; i++) { await page.waitForTimeout(gap); await page.mouse.move(c.x, c.y + (dy * i) / n) }
      if (snap) await shot(snap)
      await page.waitForTimeout(hold)
      if (release) await page.mouse.up()
    }
  }

  console.log(`--- ${kind} ---`)
  await openZoom('open')
  let s = await lb()
  check(s.open && !s.moving && s.backdrop === '' && s.thumbOpacity === '0', `opens and settles (${JSON.stringify(s)})`)
  await shot('open-settled')

  await drag(60, { snap: 'drag-short' })
  await page.waitForTimeout(40)
  await shot('springback-mid')
  await settled()
  s = await lb()
  check(s.open && !s.moving, 'short drag springs back and stays open')

  await drag(260, { snap: 'drag-long' })
  await page.waitForTimeout(60)
  await shot('close-mid')
  check(await closed(), 'long drag closes')
  s = await lb()
  check(s.thumbOpacity === '', 'thumbnail shown again after the close')

  // A flick: 60 px in ~50 ms, sent from inside the page so the timing is real.
  await openZoom()
  const fc = await centre()
  await page.evaluate(async ({ x, y, type }) => {
    const el = document.querySelector('.zoom-viewport')
    const ev = (t, py) => el.dispatchEvent(new PointerEvent(t, { pointerId: 11, pointerType: type, isPrimary: true, button: 0, clientX: x, clientY: py, bubbles: true }))
    ev('pointerdown', y)
    for (let i = 1; i <= 6; i++) { await new Promise((r) => setTimeout(r, 8)); ev('pointermove', y + i * 10) }
    ev('pointerup', y + 60)
  }, { ...fc, type: phone ? 'touch' : 'mouse' })
  check(await closed(), 'short fast flick closes')

  await openZoom()
  await page.keyboard.press('Escape')
  await page.waitForTimeout(60)
  await shot('escape-mid')
  check(await closed(), 'Escape shrinks and closes')

  // A plain larger preview (6.29): pinch (phone), wheel and double-click (PC) do not zoom, there
  // are no zoom buttons, and the close button shrinks it back into the thumbnail.
  await openZoom()
  const scaleOf = () => page.evaluate(() => {
    const t = document.querySelector('.zoom-viewport img')?.style.transform ?? ''
    return parseFloat(/scale\(([\d.e-]+)\)/.exec(t)?.[1] ?? '0')
  })
  const s0 = await scaleOf()
  const c = await centre()
  if (phone) {
    await page.evaluate(async ({ x, y }) => {
      const el = document.querySelector('.zoom-viewport')
      const ev = (type, id, px) => el.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', isPrimary: id === 1, clientX: px, clientY: y, bubbles: true }))
      ev('pointerdown', 1, x - 20); ev('pointerdown', 2, x + 20)
      for (let i = 1; i <= 8; i++) { await new Promise((r) => setTimeout(r, 16)); ev('pointermove', 1, x - 20 - i * 10); ev('pointermove', 2, x + 20 + i * 10) }
      ev('pointerup', 1, x - 100); ev('pointerup', 2, x + 100)
    }, c)
  } else {
    await page.mouse.move(c.x, c.y)
    await page.mouse.wheel(0, -400)
    await page.mouse.dblclick(c.x, c.y)
  }
  await page.waitForTimeout(250)
  const s1 = await scaleOf()
  check(Math.abs(s1 - s0) < 1e-6, `${phone ? 'pinch' : 'wheel and double-click'} do not zoom (${s0.toFixed(3)} → ${s1.toFixed(3)})`)
  check(await page.locator('.zoom-lb .zoom-buttons').count() === 0, 'no zoom buttons in the full-screen preview')
  s = await lb()
  check(s.open && !s.moving, 'still open and at rest after the pinch')
  await page.getByRole('button', { name: 'Nagyítás bezárása' }).click()
  await page.waitForTimeout(60)
  await shot('close-mid')
  check(await closed(), 'close button shrinks the photo into the thumbnail')

  // The thumbnail scrolled out of sight while open: the photo fades instead.
  await openZoom()
  await page.evaluate(() => {
    const t = document.querySelector('.thumb-open')
    let el = t?.parentElement
    while (el && !(el.scrollHeight > el.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(el).overflowY))) el = el.parentElement
    if (el) { el.style.paddingBottom = '3000px'; el.scrollTop = 2500 }
  })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(80)
  await shot('fade-mid')
  check(await closed(), 'closes with a fade when the thumbnail is off screen')
  await page.evaluate(() => document.querySelectorAll('[style*="padding-bottom: 3000px"]').forEach((el) => { el.style.paddingBottom = ''; el.scrollTop = 0 }))

  // Reduced motion: no growth or shrink.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.locator('.thumb-open').first().click()
  s = await lb()
  check(s.open && !s.moving, 'reduced motion: opens without the flyer')
  await page.keyboard.press('Escape')
  s = await lb()
  check(!s.open, 'reduced motion: closes at once')
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  const focused = await page.evaluate(() => document.activeElement?.className ?? '')
  check(focused.includes('thumb-open'), `focus back on the thumbnail (${focused})`)
  check(errors.length === 0, `no console errors${errors.length ? ': ' + errors.join(' | ') : ''}`)
  await ctx.close()
}
await browser.close()
console.log(failed ? `${failed} FAILED` : 'all ok')
process.exit(failed ? 1 : 0)
