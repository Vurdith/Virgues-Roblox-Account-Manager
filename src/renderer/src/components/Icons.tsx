import type { SVGProps } from 'react'

export type IconName =
  | 'archive'
  | 'arrow'
  | 'box'
  | 'browser'
  | 'chart'
  | 'chevron'
  | 'chest'
  | 'clock'
  | 'check'
  | 'close'
  | 'code'
  | 'copy'
  | 'coins'
  | 'download'
  | 'edit'
  | 'flame'
  | 'folder'
  | 'game'
  | 'gem'
  | 'gift'
  | 'globe'
  | 'grid'
  | 'import'
  | 'key'
  | 'launch'
  | 'map'
  | 'minus'
  | 'more'
  | 'play'
  | 'plus'
  | 'refresh'
  | 'search'
  | 'server'
  | 'settings'
  | 'shield'
  | 'shirt'
  | 'spark'
  | 'square'
  | 'star'
  | 'swords'
  | 'terminal'
  | 'target'
  | 'trash'
  | 'users'
  | 'warning'
  | 'watch'
  | 'window'
  | 'wrench'

export function Icon({ name, size = 18, strokeWidth = 2.2, filled = false, ...props }: { name: IconName; size?: number; strokeWidth?: number; filled?: boolean } & SVGProps<SVGSVGElement>) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...props,
  }

  switch (name) {
    case 'archive':
      return <svg {...common}><path d="M4 7.5h16v12H4z" /><path d="M3 4.5h18v3H3zM9 11.5h6" /></svg>
    case 'arrow':
      return <svg {...common}><path d="M5 12h13" /><path d="m13 6 6 6-6 6" /></svg>
    case 'box':
      return <svg {...common}><path d="m4 8 8-4 8 4-8 4z" /><path d="M4 8v9l8 4 8-4V8M12 12v9M8 6l8 4" /></svg>
    case 'browser':
      return <svg {...common}><rect x="3.5" y="4" width="17" height="16" rx="1.5" /><path d="M4 8.5h16M8 6.25h.01M11 6.25h.01M14 6.25h.01" /></svg>
    case 'chart':
      return <svg {...common}><path d="M4 4v16h16" /><path d="m7 15 3.5-4 3 2 4.5-6" /></svg>
    case 'chevron':
      return <svg {...common}><path d="m7 10 5 5 5-5" /></svg>
    case 'chest':
      return <svg {...common}><path d="M4 8h16v11H4z" /><path d="M3 8h18l-2-4H5zM4 12h16M12 10v4M10.5 12h3" /></svg>
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3.5 2" /></svg>
    case 'check':
      return <svg {...common}><path d="m5 12 4.5 4.5L19 7" /></svg>
    case 'close':
      return <svg {...common}><path d="m6 6 12 12M18 6 6 18" /></svg>
    case 'code':
      return <svg {...common}><path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14" /></svg>
    case 'copy':
      return <svg {...common}><rect x="8" y="8" width="11" height="11" rx="1" /><path d="M5 16H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11a1 1 0 0 1 1 1v1" /></svg>
    case 'coins':
      return <svg {...common}><circle cx="9" cy="9" r="4.5" /><path d="M9 6.8v4.4M7.5 8.1c.5-.7 2.5-.6 2.8.3.3.9-2.7.8-2.5 1.8.2 1 2.4 1 2.9.2M14.5 11.5a4.5 4.5 0 1 0 0 7" /><path d="M14 15h6M17 12v6" /></svg>
    case 'download':
      return <svg {...common}><path d="M12 3v12M7 11l5 5 5-5M4 20h16" /></svg>
    case 'edit':
      return <svg {...common}><path d="m4 16.5-.8 3.3 3.3-.8L18.8 6.7a2.3 2.3 0 0 0-3.3-3.3z" /><path d="m14 5 3 3" /></svg>
    case 'flame':
      return <svg {...common}><path d="M13.5 3.5c.5 3-1.5 4.5-1.5 6.5 0 1.3.8 2.2 1.8 2.7.3-1.8 1.5-3 2.4-4.1 1.7 1.8 2.8 4 2.8 6.3a7 7 0 1 1-12.7-4.1c1.2 1.3 2.2 2.4 2.4 4.1 1.2-.8 1.8-2 1.8-3.4 0-2.1 1.3-4.8 3-8z" /></svg>
    case 'folder':
      return <svg {...common}><path d="M3.5 6.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" /></svg>
    case 'game':
      return <svg {...common}><path d="M7 8h10a4 4 0 0 1 3.7 5.5l-1.1 2.8a2.5 2.5 0 0 1-4.3.6L14 15H10l-1.3 1.9a2.5 2.5 0 0 1-4.3-.6l-1.1-2.8A4 4 0 0 1 7 8Z" /><path d="M7 11v4M5 13h4M16.5 12.5h.01M18.5 14.5h.01" /></svg>
    case 'gem':
      return <svg {...common}><path d="m5 4 7-1 7 1 2 5-9 12L3 9z" /><path d="m5 4 7 5 7-5M3 9h18M12 9v11M8 4l4 5 4-5" /></svg>
    case 'gift':
      return <svg {...common}><path d="M4 10h16v10H4zM3 7h18v3H3zM12 7v13" /><path d="M12 7H8.5a2.5 2.5 0 1 1 2.3-3.4L12 7ZM12 7h3.5a2.5 2.5 0 1 0-2.3-3.4L12 7Z" /></svg>
    case 'globe':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M3.8 12h16.4M12 3.5c2.2 2.4 3.3 5.2 3.3 8.5S14.2 18.1 12 20.5C9.8 18.1 8.7 15.3 8.7 12S9.8 5.9 12 3.5Z" /></svg>
    case 'grid':
      return <svg {...common}><rect x="4" y="4" width="6" height="6" /><rect x="14" y="4" width="6" height="6" /><rect x="4" y="14" width="6" height="6" /><rect x="14" y="14" width="6" height="6" /></svg>
    case 'import':
      return <svg {...common}><path d="M12 21V9" /><path d="m7 13 5-5 5 5" /><path d="M4 4h16" /></svg>
    case 'key':
      return <svg {...common}><circle cx="8.5" cy="15.5" r="3.5" /><path d="m11 13 8-8M16 6l2 2M14 8l2 2" /></svg>
    case 'launch':
      return <svg {...common}><path d="M13 4h7v7" /><path d="m20 4-9 9" /><path d="M19 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h5" /></svg>
    case 'map':
      return <svg {...common}><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2zM9 3v16M15 5v16" /></svg>
    case 'minus':
      return <svg {...common}><path d="M5 12h14" /></svg>
    case 'more':
      return <svg {...common}><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="12" cy="12" r="1" fill="currentColor" /><circle cx="19" cy="12" r="1" fill="currentColor" /></svg>
    case 'play':
      return <svg {...common}><path d="m8 5 11 7-11 7z" /></svg>
    case 'plus':
      return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>
    case 'refresh':
      return <svg {...common}><path d="M20 11a8 8 0 0 0-14.7-4L3 10M3 5v5h5M4 13a8 8 0 0 0 14.7 4L21 14M21 19v-5h-5" /></svg>
    case 'search':
      return <svg {...common}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    case 'server':
      return <svg {...common}><rect x="4" y="4" width="16" height="6" rx="1" /><rect x="4" y="14" width="16" height="6" rx="1" /><path d="M7 7h.01M7 17h.01M11 7h6M11 17h6" /></svg>
    case 'settings':
      return <svg {...common}><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /><circle cx="12" cy="12" r="4" /></svg>
    case 'shield':
      return <svg {...common}><path d="M12 3 19 6v5c0 4.8-3 8.2-7 10-4-1.8-7-5.2-7-10V6z" /><path d="m8.5 12 2.3 2.3 4.8-5" /></svg>
    case 'shirt':
      return <svg {...common}><path d="m9 4 3 2 3-2 5 3-2 4-2-1v10H8V10l-2 1-2-4z" /><path d="M9 4c.2 2 1.2 3 3 3s2.8-1 3-3" /></svg>
    case 'spark':
      return <svg {...common}><path d="m12 3 1.35 5.65L19 10l-5.65 1.35L12 17l-1.35-5.65L5 10l5.65-1.35z" /><path d="m19 16 .45 1.55L21 18l-1.55.45L19 20l-.45-1.55L17 18l1.55-.45z" /></svg>
    case 'square':
      return <svg {...common}><rect x="5" y="5" width="14" height="14" rx="1" /></svg>
    case 'star':
      return <svg {...common} fill={filled ? 'currentColor' : 'none'}><path d="m12 3 2.8 5.8 6.2.9-4.5 4.5 1.1 6.3-5.6-3-5.6 3 1.1-6.3L3 9.7l6.2-.9z" /></svg>
    case 'swords':
      return <svg {...common}><path d="m6 4 14 14M18 4 4 18" /><path d="M5 3H3v2l14 14h2v-2zM19 3h2v2L7 19H5v-2z" /><path d="M3 8h4M17 16h4" /></svg>
    case 'terminal':
      return <svg {...common}><rect x="3.5" y="4" width="17" height="16" rx="1" /><path d="m7 9 3 3-3 3M13 15h4" /></svg>
    case 'target':
      return <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
    case 'trash':
      return <svg {...common}><path d="M4 7h16M9 7V4h6v3M7 7l.8 13h8.4L17 7M10 11v5M14 11v5" /></svg>
    case 'users':
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0M16 5.5a3 3 0 0 1 0 5.8M17 14a4.5 4.5 0 0 1 3.5 5" /></svg>
    case 'warning':
      return <svg {...common}><path d="M12 3.5 21 20H3z" /><path d="M12 9v5M12 17.2h.01" /></svg>
    case 'watch':
      return <svg {...common}><path d="M8 3h8l1 4H7zM7 17h10l-1 4H8z" /><rect x="5" y="7" width="14" height="10" rx="3" /><path d="M12 10v2l1.5 1" /></svg>
    case 'window':
      return <svg {...common}><rect x="4" y="4" width="16" height="16" rx="1" /><path d="M4 9h16" /></svg>
    case 'wrench':
      return <svg {...common}><path d="M14.5 6.5a4 4 0 0 0-5.3 5.3L4 17a2.1 2.1 0 0 0 3 3l5.2-5.2a4 4 0 0 0 5.3-5.3l-2.8 2.8-2.1-2.1z" /></svg>
    default:
      return null
  }
}
