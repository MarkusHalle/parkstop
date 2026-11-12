// Inline stroke icons from the approved mockups. Decorative: aria-hidden.
import type { ReactNode } from 'react'

function Svg({ size = 22, children, strokeWidth = 1.8 }: { size?: number; children: ReactNode; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {children}
    </svg>
  )
}

export const LogoPin = ({ size = 22 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path d="M12 22s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z" fill="var(--c-primary)" />
    <circle cx="12" cy="10" r="2.6" fill="var(--c-surface)" />
  </svg>
)
export const IconHistory = () => <Svg><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></Svg>
export const IconSettings = () => <Svg><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></Svg>
export const IconBack = () => <Svg size={24} strokeWidth={2}><path d="M15 5l-7 7 7 7" /></Svg>
export const IconCamera = ({ size = 22 }: { size?: number }) => <Svg size={size}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></Svg>
export const IconLocate = () => <Svg><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /><path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" /></Svg>
export const IconPin = ({ size = 22 }: { size?: number }) => <Svg size={size}><path d="M12 21s6.5-6 6.5-11a6.5 6.5 0 0 0-13 0c0 5 6.5 11 6.5 11z" /><circle cx="12" cy="10" r="2.3" /></Svg>
export const IconCheck = ({ size = 14 }: { size?: number }) => <Svg size={size} strokeWidth={2.6}><path d="M5 12.5l4.5 4.5L19 7.5" /></Svg>
export const IconInfo = ({ size = 16 }: { size?: number }) => <Svg size={size} strokeWidth={2}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></Svg>
export const IconWarn = ({ size = 16 }: { size?: number }) => <Svg size={size} strokeWidth={2}><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17h.01" /></Svg>
export const IconChevron = ({ dir = 'right', size = 20 }: { dir?: 'left' | 'right'; size?: number }) => (
  <Svg size={size} strokeWidth={2}><path d={dir === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7'} /></Svg>
)
export const IconPlus =() => <Svg size={26}><path d="M12 5v14M5 12h14" /></Svg>
export const IconClose = ({ size = 18 }: { size?: number }) => <Svg size={size} strokeWidth={2.2}><path d="M6 6l12 12M18 6L6 18" /></Svg>
export const IconCopy = () => <Svg><rect x="8" y="8" width="11" height="11" rx="2" /><path d="M5 15V6a1 1 0 0 1 1-1h9" /></Svg>
export const IconDownload = () => <Svg><path d="M12 4v11M8 11l4 4 4-4M5 19h14" /></Svg>
export const IconMail = () => <Svg><rect x="3.5" y="5.5" width="17" height="13" rx="2" /><path d="M4 7l8 6 8-6" /></Svg>
export const IconPhone = () => <Svg size={20}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" /></Svg>
export const IconImage = () => <Svg><rect x="4" y="5" width="16" height="14" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M20 16l-5-5-8 8" /></Svg>
