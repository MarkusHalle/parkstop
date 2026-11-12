import { describe, expect, it } from 'vitest'
import { hu } from './hu'

// Walk the whole string tree: every string, and every string a function returns for
// sample arguments, must be non-empty.
function walk(node: unknown, path: string, out: [string, string][]) {
  if (typeof node === 'string') out.push([path, node])
  else if (typeof node === 'function') out.push([path, String((node as (...a: unknown[]) => unknown)(1, 'x', 'y'))])
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`, out))
  else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, out)
}

describe('hu strings', () => {
  const all: [string, string][] = []
  walk(hu, '', all)

  it('has no empty values', () => {
    expect(all.length).toBeGreaterThan(100)
    for (const [key, value] of all) expect(value.trim().length, key).toBeGreaterThan(0)
  })

  it('has twelve month names', () => {
    expect(hu.mailTemplate.months).toHaveLength(12)
  })
})
