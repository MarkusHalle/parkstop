// The critically damped spring the phone's motion settles with (the sheet fold uses the same
// constants in useSheetMorph). Runs on requestAnimationFrame and hands each frame's value to
// `onFrame`; it stops at its target instead of overshooting, so a flick never throws the
// screens past their end.

export const STIFFNESS = 170
export const DAMPING = 26 // 2·√170: critically damped, settles without a bounce

/**
 * Springs from `from` to `to`, starting at speed `v0` (units per second). Returns a function
 * that stops it where it is; `done` runs only when it reaches the target.
 */
export function spring(from: number, to: number, v0: number, onFrame: (p: number) => void, done: () => void): () => void {
  let p = from
  let v = v0
  let last = performance.now()
  let raf = 0
  const up = to >= from
  const step = (now: number) => {
    const dt = Math.min(0.032, (now - last) / 1000)
    last = now
    for (let i = 0; i < 4; i++) {
      v += ((-STIFFNESS * (p - to) - DAMPING * v) * dt) / 4
      p += (v * dt) / 4
      if (up ? p > to : p < to) { p = to; v = 0 }
    }
    if (Math.abs(p - to) < 0.002 && Math.abs(v) < 0.02) {
      onFrame(to)
      done()
      return
    }
    onFrame(p)
    raf = requestAnimationFrame(step)
  }
  raf = requestAnimationFrame(step)
  return () => cancelAnimationFrame(raf)
}
