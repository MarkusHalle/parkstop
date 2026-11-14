// Phone bottom-sheet grip: tap (or Enter/Space) toggles; a drag moves the fold with the finger
// and a release settles it, open or folded by where and how fast the finger let go (roadmap
// 6.14). The folded sheet keeps a one-line summary and the main button visible.
import { useRef, type PointerEvent } from 'react'
import { hu } from '../i18n/hu'
import type { SheetMorph } from './useSheetMorph'

const DRAG_PX = 6

interface Props {
  open: boolean
  onChange: (open: boolean) => void
  morph: SheetMorph
}

export function SheetHandle({ open, onChange, morph }: Props) {
  const start = useRef<number | null>(null)
  const dragged = useRef(false)
  const lastY = useRef(0)
  const lastT = useRef(0)
  const speed = useRef(0)

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    start.current = e.clientY
    dragged.current = false
    lastY.current = e.clientY
    lastT.current = e.timeStamp
    speed.current = 0
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return
    const dy = e.clientY - start.current
    if (!dragged.current) {
      if (Math.abs(dy) < DRAG_PX) return
      dragged.current = true
      morph.dragStart()
    }
    const dt = e.timeStamp - lastT.current
    if (dt > 0) speed.current = ((e.clientY - lastY.current) / dt) * 1000
    lastY.current = e.clientY
    lastT.current = e.timeStamp
    morph.dragMove(dy)
  }
  const up = (e: PointerEvent<HTMLButtonElement>) => {
    if (start.current === null) return
    start.current = null
    if (!dragged.current) return
    // A finger that stopped before letting go has no speed left.
    const v = e.timeStamp - lastT.current > 80 ? 0 : speed.current
    const next = morph.dragEnd(v)
    if (next !== open) onChange(next)
  }

  return (
    <button
      type="button"
      className="sheet-handle"
      aria-expanded={open}
      aria-label={open ? hu.sheet.collapse : hu.sheet.expand}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={() => {
        // A drag already decided; a plain tap or keyboard press toggles.
        if (dragged.current) dragged.current = false
        else onChange(!open)
      }}
    >
      <span className="sheet-grip" aria-hidden="true" />
    </button>
  )
}
