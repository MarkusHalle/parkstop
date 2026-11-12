// Phone bottom-sheet grip: tap (or Enter/Space) toggles, a drag down folds the sheet, a drag
// up opens it. The folded sheet keeps a one-line summary and the main button visible.
import { useRef, type PointerEvent } from 'react'
import { hu } from '../i18n/hu'

const DRAG_PX = 24

interface Props {
  open: boolean
  onChange: (open: boolean) => void
}

export function SheetHandle({ open, onChange }: Props) {
  const startY = useRef<number | null>(null)
  const dragged = useRef(false)

  const down = (e: PointerEvent<HTMLButtonElement>) => {
    startY.current = e.clientY
    dragged.current = false
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLButtonElement>) => {
    if (startY.current === null || dragged.current) return
    const dy = e.clientY - startY.current
    if (Math.abs(dy) < DRAG_PX) return
    dragged.current = true
    onChange(dy < 0)
  }
  const up = () => {
    startY.current = null
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
