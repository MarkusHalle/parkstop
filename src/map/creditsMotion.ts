// Animates MapLibre's compact attribution ("i" button and credits) as it folds and unfolds
// (owner). MapLibre switches it by toggling the `maplibregl-compact-show` class, so the card
// changes size in one frame; this watches that class and eases the card from its old size to
// the new one. It stays anchored at the bottom right, so it grows up and to the left. Off when
// the user prefers reduced motion. DOM only, no React.

const EASE = 'cubic-bezier(0.2, 0, 0, 1)'

export function animateCreditsFold(root: HTMLElement): () => void {
  const el = root.querySelector<HTMLElement>('.maplibregl-ctrl-attrib')
  if (!el) return () => {}
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
  let last = el.getBoundingClientRect()
  let anim: Animation | null = null

  // Keep the last settled size (content can change when the style loads).
  const ro = new ResizeObserver(() => {
    if (anim?.playState !== 'running') last = el.getBoundingClientRect()
  })
  // MapLibre switches the class first and opens the <details> element after it, so the new size
  // is only known a moment later (measuring at once gave a small box that then jumped to full
  // size). Hold the card at its old size until the next frame, then measure and animate.
  let pending = 0
  const mo = new MutationObserver(() => {
    if (reduced.matches || pending) return
    const from = last
    anim?.cancel()
    el.style.width = `${from.width}px`
    el.style.height = `${from.height}px`
    el.style.overflow = 'hidden'
    pending = requestAnimationFrame(() => {
      pending = 0
      el.style.width = ''
      el.style.height = ''
      el.style.overflow = ''
      run(from)
    })
  })
  const run = (from: DOMRect) => {
    const to = el.getBoundingClientRect()
    last = to
    if (Math.abs(from.width - to.width) < 2 && Math.abs(from.height - to.height) < 2) return
    const open = el.classList.contains('maplibregl-compact-show')
    anim = el.animate(
      [
        { width: `${from.width}px`, height: `${from.height}px`, borderRadius: open ? '16px' : '10px', overflow: 'hidden' },
        { width: `${to.width}px`, height: `${to.height}px`, borderRadius: open ? '10px' : '16px', overflow: 'hidden' },
      ],
      { duration: 260, easing: EASE },
    )
    // Unfolding: keep the text hidden while the card grows, then fade it in, so it is never
    // seen clipped inside the still-small card (owner: unfolding was not smooth).
    const inner = el.querySelector<HTMLElement>('.maplibregl-ctrl-attrib-inner')
    if (open && inner) {
      inner.animate([{ opacity: 0 }, { opacity: 0, offset: 0.55 }, { opacity: 1 }], { duration: 440, easing: 'ease' })
    }
  }
  ro.observe(el)
  mo.observe(el, { attributes: true, attributeFilter: ['class', 'open'] })
  return () => {
    ro.disconnect()
    mo.disconnect()
    cancelAnimationFrame(pending)
    anim?.cancel()
  }
}
