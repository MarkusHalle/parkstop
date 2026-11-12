// Pure helpers for the PWA toast placement.

const GAP = 12
const BASE = 16

/** Distance of the update toast from the bottom edge: above the phone bottom sheet when one is shown. */
export function toastBottom(sheetHeight: number | null): number {
  return sheetHeight && sheetHeight > 0 ? Math.round(sheetHeight) + GAP : BASE
}
