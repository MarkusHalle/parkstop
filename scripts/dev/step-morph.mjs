// Step 1 → 2 summary morph check (roadmap 6.19). See README.md.
// node scripts/dev/step-morph.mjs [place] [light|dark] [reduce]
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const place = process.argv[2] ?? 'Hunyadi tér'
const scheme = process.argv[3] ?? 'light'
const reduce = process.argv[4] === 'reduce'
const tag = `${place.replace(/\W+/g, '-').toLowerCase()}-${scheme}${reduce ? '-reduce' : ''}`
const out = 'test-results-e2e/dev'
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({
  viewport: { width: 375, height: 812 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, ignoreHTTPSErrors: true,
  colorScheme: scheme, reducedMotion: reduce ? 'reduce' : 'no-preference',
})
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
const settled = () => page.waitForFunction(() => !document.querySelector('.step-morph, .page-ghost')
  && [...document.querySelectorAll('.app-phone > .sheet, .app-phone > .page')].every((e) => !e.style.transform), null, { timeout: 20000 })
  .then(() => page.waitForTimeout(150), () => console.log('  (did not settle)'))

await page.goto(process.env.DEV_URL ?? 'http://localhost:5177/')
await page.waitForSelector('#ps-search-input', { timeout: 20000 })
await page.fill('#ps-search-input', place)
await page.press('#ps-search-input', 'Enter')
await page.waitForSelector('.ps-search__hit', { timeout: 15000 })
await page.locator('.ps-search__hit').first().click()
await page.waitForSelector('.sheet .title', { timeout: 15000 })
await page.waitForTimeout(2500)
console.log('card title:', await page.locator('.sheet-body .title').textContent())

/** Pointer events on the sheet or page, like a finger (see tests/e2e/swipe.spec.ts). */
const touch = (selector, type, x) => page.evaluate(({ selector, type, x }) => {
  document.querySelector(selector).dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: 600, bubbles: true }))
}, { selector, type, x })
const dragTo = async (selector, from, to) => {
  for (let i = 1; i <= 6; i++) { await touch(selector, 'pointermove', from + ((to - from) * i) / 6); await page.waitForTimeout(16) }
}

/** Largest distance between each travelling word and the same word in the real text (in order). */
const jump = (realSelectors) => page.evaluate((sels) => {
  const wordsOf = (el) => {
    const out = []
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
    const range = document.createRange()
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      for (const m of n.textContent.matchAll(/\S+/g)) {
        range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length)
        const r = range.getBoundingClientRect()
        out.push({ text: m[0], x: r.left, y: r.top, h: r.height })
      }
    }
    return out
  }
  const real = sels.flatMap((s) => [...document.querySelectorAll(s)].flatMap(wordsOf))
  const movers = [...document.querySelectorAll('.step-morph > span')].filter((m) => getComputedStyle(m).opacity === '1').flatMap(wordsOf)
  if (movers.length === 0) return { words: 0, max: null }
  let k = 0, max = 0
  const worst = []
  for (const m of movers) {
    while (k < real.length && real[k].text !== m.text) k++
    if (k === real.length) break
    const d = Math.max(Math.abs(m.x - real[k].x), Math.abs(m.y - real[k].y), Math.abs(m.h - real[k].h))
    if (d > max) max = d
    worst.push(`${m.text}:${d.toFixed(2)}`)
    k++
  }
  return { words: movers.length, max: Math.round(max * 100) / 100, worst: worst.join(' ') }
}, realSelectors)

const shot = (name) => page.screenshot({ path: `${out}/morph-${tag}-${name}.png` })
const W = 375
const sources = ['.sheet-body .title', '.sheet-body .address-line > span']

// 1. Swipe forward, held at 0 / 30 / 70 / 100 %.
await touch('.sheet-body', 'pointerdown', 340)
await dragTo('.sheet-body', 340, 310)
await dragTo('.sheet-body', 310, 340) // back to 0 %: the words sit on the card's text
console.log('start (0 %) jump:', JSON.stringify(await jump(sources)))
await shot('swipe-000')
for (const f of [0.3, 0.7, 1]) {
  await dragTo('.sheet-body', 340 - (f === 0.3 ? 0 : f === 0.7 ? 0.3 : 0.7) * W, 340 - f * W)
  await page.waitForTimeout(80)
  await shot(`swipe-${String(f * 100).padStart(3, '0')}`)
}
console.log('end (100 %) jump vs peeking header:', JSON.stringify(await jump(['.page-peek .page-context'])))
const before = await page.evaluate(() => [...document.querySelectorAll('.step-morph > span')].map((m) => { const r = document.createRange(); r.selectNodeContents(m); const b = r.getBoundingClientRect(); return [m.textContent, b.left, b.top] }))
await touch('.sheet-body', 'pointerup', 340 - W)
await settled()
const after = await page.evaluate((before) => {
  const el = document.querySelector('.app-phone > .page .page-context')
  if (!el) return 'no context line'
  const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  const real = []
  for (let n = walk.nextNode(); n; n = walk.nextNode()) for (const m of n.textContent.matchAll(/\S+/g)) {
    range.setStart(n, m.index); range.setEnd(n, m.index + m[0].length); const r = range.getBoundingClientRect(); real.push([m[0], r.left, r.top])
  }
  let max = 0
  for (const [t, x, y] of before) { const r = real.find((q) => q[0] === t); if (r) max = Math.max(max, Math.abs(r[1] - x), Math.abs(r[2] - y)) }
  return { context: el.textContent, maxVsLastFrame: Math.round(max * 100) / 100 }
}, before)
console.log('arrived:', JSON.stringify(after))
await shot('step2')

// 2. Back swipe from step 2, held at 50 %, then released.
const pageSel = '.app-phone > .page .page-body'
await touch(pageSel, 'pointerdown', 40)
await dragTo(pageSel, 40, 40 + W / 2)
await page.waitForTimeout(80)
await shot('back-swipe-050')
await touch(pageSel, 'pointerup', 40 + W / 2)
await settled()
console.log('back swipe:', await page.locator('.app-phone > .page').count() === 0 ? 'step 1' : 'still step 2')
console.log('  back at step 1, title visible:', await page.locator('.sheet-body .title').isVisible())

// 3. The main button, sampled while it plays, then the Back button.
await page.locator('.sheet-footer .btn-primary').click()
for (const ms of [60, 140]) { await page.waitForTimeout(ms === 60 ? 60 : 80); await shot(`button-${ms}ms`) }
await settled()
console.log('button: page transform', await page.locator('.app-phone > .page').evaluate((e) => getComputedStyle(e).transform))
await page.locator('.app-phone > .page .page-header .icon-btn').click()
await page.waitForTimeout(120)
await shot('back-button-mid')
await settled()
console.log('back button:', await page.locator('.app-phone > .page').count() === 0 ? 'step 1' : 'still step 2',
  '| leftovers:', await page.evaluate(() => document.querySelectorAll('.step-morph, .page-ghost').length),
  '| hidden texts left:', await page.evaluate(() => [...document.querySelectorAll('.sheet-body .title, .sheet-body .address-line > span, .sheet-peek-name, .sheet-peek-sub')].filter((e) => e.style.visibility || e.style.opacity).length))

// 4. Folded sheet → step 2 (the folded summary's texts travel).
await page.locator('.sheet-handle').click()
await page.waitForFunction(() => !document.querySelector('.sheet-morph'), null, { timeout: 20000 })
await page.waitForTimeout(200)
await touch('.sheet-fold-peek', 'pointerdown', 340)
await dragTo('.sheet-fold-peek', 340, 340 - 0.5 * W)
await page.waitForTimeout(80)
await shot('folded-swipe-050')
console.log('folded: travelling words', await page.locator('.step-morph > span').count(), '| cross-fade:', await page.evaluate(() => document.querySelector('.sheet-peek-name')?.style.opacity ?? ''))
await touch('.sheet-fold-peek', 'pointerup', 340 - 0.5 * W)
await settled()
console.log('errors:', errors.length ? errors : 'none')
await browser.close()
