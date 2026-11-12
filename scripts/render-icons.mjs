// Dev-only (D41): renders the PNG app icons in public/icons/ from the master SVGs with a
// locally installed Edge or Chrome in headless mode. No npm dependency.
// Usage: node scripts/render-icons.mjs   (set BROWSER=path\to\chrome.exe to override)
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const JOBS = [
  ['public/icons/favicon.svg', 'favicon-32.png', 32],
  ['docs/brand/icon-any.svg', 'icon-192.png', 192],
  ['docs/brand/icon-any.svg', 'icon-512.png', 512],
  ['docs/brand/icon-maskable.svg', 'icon-maskable-512.png', 512],
  ['docs/brand/icon-apple-touch.svg', 'apple-touch-icon-180.png', 180],
]
const CANDIDATES = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)
const browser = CANDIDATES.find((p) => existsSync(p))
if (!browser) {
  console.error('render-icons: no Edge or Chrome found; set BROWSER to its path.')
  process.exit(1)
}

const tmp = mkdtempSync(join(tmpdir(), 'parkstop-icons-'))
try {
  for (const [src, name, size] of JOBS) {
    const svg = readFileSync(join(root, src), 'utf8')
    const page = join(tmp, `${name}.html`)
    writeFileSync(page, `<!doctype html><html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" ` +
      `width="${size}" height="${size}" style="display:block"></body></html>`)
    const out = join(root, 'public/icons', name)
    execFileSync(browser, [
      '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
      '--default-background-color=00000000', `--window-size=${size},${size}`,
      `--user-data-dir=${join(tmp, 'profile')}`, `--screenshot=${out}`, pathToFileURL(page).href,
    ], { stdio: 'ignore', timeout: 60_000 })
    console.log(`${name}  ${size}x${size}`)
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}
