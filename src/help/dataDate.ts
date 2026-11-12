// The "data checked on" date shown in the help (SPEC 4.2: the card shows when the data was
// last verified). Uses the OLDEST verifiedOn in the bundled authority data, so the help never
// claims the data is fresher than its stalest record. Pure; walks any JSON shape.

export function oldestVerifiedOn(data: unknown): string | null {
  let oldest: string | null = null
  const visit = (v: unknown): void => {
    if (Array.isArray(v)) {
      v.forEach(visit)
    } else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (k === 'verifiedOn' && typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x)) {
          if (oldest === null || x < oldest) oldest = x
        } else {
          visit(x)
        }
      }
    }
  }
  visit(data)
  return oldest
}
