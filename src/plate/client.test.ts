// L7: network trouble while downloading is retried with the next photo; only a device that
// cannot run the reader turns it off for the page (F-PLATE-7).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FromWorker, ToWorker } from './protocol'

type Script = (msg: ToWorker, reply: (m: FromWorker) => void) => void

let scripts: Script[] = []
let created = 0

class FakeWorker {
  onmessage: ((ev: { data: FromWorker }) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessageerror: (() => void) | null = null
  private script: Script
  constructor() {
    this.script = scripts[created++] ?? (() => {})
  }
  postMessage(msg: ToWorker) {
    queueMicrotask(() => this.script(msg, (m) => this.onmessage?.({ data: m })))
  }
  terminate() {}
}

const ready: Script = (msg, reply) => {
  if (msg.type === 'load') reply({ type: 'ready' })
  else if (msg.type === 'read') reply({ type: 'result', id: msg.id, width: 10, height: 10, plates: [], timings: {} })
}

beforeEach(() => {
  vi.resetModules()
  scripts = []
  created = 0
  vi.stubGlobal('Worker', FakeWorker)
})
afterEach(() => vi.unstubAllGlobals())

describe('plate reader client', () => {
  it('retries after a network failure while downloading', async () => {
    scripts = [(msg, reply) => { if (msg.type === 'load') reply({ type: 'loadFailed', message: 'HTTP 503', retryable: true }) }, ready]
    const c = await import('./client')
    const photo = new Blob(['x'])
    await expect(c.readPhoto(photo)).rejects.toBeInstanceOf(c.ReaderRetryError)
    expect(c.getReaderSnapshot().status).toBe('retry')
    // The next photo starts a fresh worker and works.
    await expect(c.readPhoto(photo)).resolves.toMatchObject({ plates: [] })
    expect(c.getReaderSnapshot().status).toBe('ready')
    expect(created).toBe(2)
  })

  it('stays off for the page when the device cannot run it', async () => {
    scripts = [(msg, reply) => { if (msg.type === 'load') reply({ type: 'loadFailed', message: 'session', retryable: false }) }, ready]
    const c = await import('./client')
    const photo = new Blob(['x'])
    await expect(c.readPhoto(photo)).rejects.not.toBeInstanceOf(c.ReaderRetryError)
    expect(c.getReaderSnapshot().status).toBe('failed')
    await expect(c.readPhoto(photo)).rejects.toThrow()
    expect(created).toBe(1)
  })

  it('reports the download once at its start and once at its end', async () => {
    const seen: string[] = []
    scripts = [(msg, reply) => {
      if (msg.type !== 'load') return
      reply({ type: 'progress', loaded: 0, total: 100 })
      reply({ type: 'progress', loaded: 50, total: 100 })
      reply({ type: 'progress', loaded: 100, total: 100 })
      reply({ type: 'ready' })
    }]
    const c = await import('./client')
    c.subscribeReader(() => {
      const d = c.getReaderSnapshot().download
      if (seen[seen.length - 1] !== d) seen.push(d)
    })
    await c.startReader()
    expect(seen).toEqual(['none', 'running', 'done'])
  })
})
