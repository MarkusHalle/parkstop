// Brand mark and interface icons (D41). Hand-written SVG. Interface icons share the mark's
// drawing style: 2 px geometric strokes, flat ends, sharp corners, dots as small squares.
// Decorative: aria-hidden.
import type { ReactNode } from 'react'

function Svg({ size = 22, children, strokeWidth = 2 }: { size?: number; children: ReactNode; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="butt" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

const Dot = ({ x, y, s = 2.2 }: { x: number; y: number; s?: number }) => (
  <rect x={x - s / 2} y={y - s / 2} width={s} height={s} fill="currentColor" stroke="none" />
)

/* ParkStop mark: an own drawing of a no-stopping sign on its post, stuck into the map, on a
   tram-yellow tile. Same geometry as docs/brand/parkstop-mark.svg. The brand colours stay
   fixed in light and dark mode. */
const MARK_INK = '#1c1c1c'
const MARK_YELLOW = '#ffd100'
export const LogoMark = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden="true" focusable="false" className="logo-mark">
    <rect width="100" height="100" rx="22" fill={MARK_YELLOW} />
    <ellipse cx="50" cy="85" rx="14" ry="4" fill={MARK_INK} />
    <path d="M50 62V84" stroke={MARK_INK} strokeWidth="8" />
    <circle cx="50" cy="39" r="23" fill={MARK_YELLOW} stroke={MARK_INK} strokeWidth="9.5" />
    <path d="M33.7 22.7L66.3 55.3M66.3 22.7L33.7 55.3" stroke={MARK_INK} strokeWidth="8" />
  </svg>
)

export const IconHistory = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.5l3.5 2" /></Svg>
export const IconSettings = () => <Svg><path d="M3.5 7H14M18 7h2.5M3.5 17H8M12 17h8.5" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>
export const IconHelp = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14" /><Dot x={12} y={16.8} /></Svg>
export const IconBack = () => <Svg size={24} strokeWidth={2.2}><path d="M15 5l-7 7 7 7" /></Svg>
export const IconCamera = ({ size = 22 }: { size?: number }) => <Svg size={size}><path d="M3.5 7.5h4L9 5h6l1.5 2.5h4v12h-17z" /><circle cx="12" cy="13.5" r="3.5" /></Svg>
export const IconLocate = () => <Svg><circle cx="12" cy="12" r="6" /><Dot x={12} y={12} s={3} /><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" /></Svg>
export const IconPin = ({ size = 22 }: { size?: number }) => <Svg size={size}><path d="M12 21.5l-5.4-7.7a6.5 6.5 0 1 1 10.8 0z" /><circle cx="12" cy="10" r="2.3" /></Svg>
export const IconCheck = ({ size = 14 }: { size?: number }) => <Svg size={size} strokeWidth={2.8}><path d="M4.5 12.5l5 5L19.5 7" /></Svg>
export const IconInfo = ({ size = 16 }: { size?: number }) => <Svg size={size} strokeWidth={2.2}><circle cx="12" cy="12" r="9" /><path d="M12 10.5v6.5" /><Dot x={12} y={7.6} s={2.4} /></Svg>
export const IconWarn = ({ size = 16 }: { size?: number }) => <Svg size={size} strokeWidth={2.2}><path d="M12 3.5l9 16.5H3z" /><path d="M12 9.5v5" /><Dot x={12} y={17} s={2.4} /></Svg>
const CHEVRON = { left: 'M15 5l-7 7 7 7', right: 'M9 5l7 7-7 7', up: 'M5 15l7-7 7 7' } as const
export const IconChevron = ({ dir = 'right', size = 20 }: { dir?: keyof typeof CHEVRON; size?: number }) => (
  <Svg size={size} strokeWidth={2.2}><path d={CHEVRON[dir]} /></Svg>
)
export const IconPlus = () => <Svg size={26}><path d="M12 4.5v15M4.5 12h15" /></Svg>
export const IconClose = ({ size = 18 }: { size?: number }) => <Svg size={size} strokeWidth={2.4}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const IconCopy = () => <Svg><rect x="8.5" y="8.5" width="11" height="11" /><path d="M5 15.5V4.5h11" /></Svg>
export const IconDownload = () => <Svg><path d="M12 3.5v11.5M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" /></Svg>
export const IconMail = () => <Svg><rect x="3.5" y="5.5" width="17" height="13" /><path d="M3.5 6.5l8.5 6.5 8.5-6.5" /></Svg>
export const IconPhone = () => <Svg size={20}><path d="M4.5 3.5h4.5l2 5-2.6 1.6a11 11 0 0 0 5.5 5.5l1.6-2.6 5 2v4.5h-2A16.5 16.5 0 0 1 2.5 5.5v-2z" /></Svg>
export const IconImage = () => <Svg><rect x="3.5" y="4.5" width="17" height="15" /><rect x="7" y="8" width="3" height="3" fill="currentColor" stroke="none" /><path d="M20.5 16l-5-5-9 8.5" /></Svg>
export const IconSun = () => <Svg><circle cx="12" cy="12" r="4" /><path d="M12 2.5V5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" /></Svg>
export const IconMoon = () => <Svg><path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" /></Svg>
export const IconDevice = () => <Svg><rect x="7" y="3" width="10" height="18" /><path d="M10.5 18h3" /></Svg>
export const IconMonitor = () => <Svg><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M9 20h6M12 16v4" /></Svg>

export const IconRefresh = ({ size = 22 }: { size?: number }) => <Svg size={size}><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" /><path d="M19.5 3.5v4h-4" /></Svg>
export const IconWifiOff = ({ size = 20 }: { size?: number }) => <Svg size={size}><path d="M2.5 9.5a15 15 0 0 1 19 0M6 13a10 10 0 0 1 12 0M9.5 16.3a5 5 0 0 1 5 0" /><Dot x={12} y={19.5} s={2.6} /><path d="M3.5 3.5l17 17" /></Svg>
export const IconMapOff = ({ size = 28 }: { size?: number }) => <Svg size={size}><path d="M9 4.5L3.5 6.5v13L9 17.5l6 2 5.5-2V9M9 4.5v13M15 8.5v11" /><path d="M3.5 3.5l17 17" /></Svg>
export const IconSearchOff = ({ size = 20 }: { size?: number }) => <Svg size={size}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5l5 5M3.5 3.5l17 17" /></Svg>
