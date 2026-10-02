import type { ReactNode } from 'react'

/**
 * Icon set.
 *
 * Hand-drawn instead of pulling in an icon library: every glyph shares the same
 * 24px grid, 1.6 stroke and round joins, which is what makes the reference's
 * icons feel consistent. Zero bytes of dependency, and only the icons actually
 * referenced are compiled in.
 */

export type IconName =
  | 'home'
  | 'search'
  | 'library'
  | 'playlist'
  | 'heart'
  | 'heartFilled'
  | 'clock'
  | 'plus'
  | 'minus'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp'
  | 'bell'
  | 'play'
  | 'pause'
  | 'skipBack'
  | 'skipForward'
  | 'shuffle'
  | 'repeat'
  | 'repeatOne'
  | 'volumeHigh'
  | 'volumeLow'
  | 'volumeMute'
  | 'queue'
  | 'sliders'
  | 'equalizer'
  | 'more'
  | 'close'
  | 'winMinimize'
  | 'winMaximize'
  | 'winRestore'
  | 'check'
  | 'download'
  | 'trash'
  | 'pencil'
  | 'externalLink'
  | 'music'
  | 'mic'
  | 'gear'
  | 'keyboard'
  | 'shield'
  | 'palette'
  | 'info'
  | 'refresh'
  | 'grip'
  | 'expand'
  | 'collapse'
  | 'user'
  | 'album'
  | 'trending'
  | 'sparkle'
  | 'cast'
  | 'sort'

const FILLED = new Set<IconName>(['heartFilled', 'play', 'pause', 'skipBack', 'skipForward', 'more'])

const PATHS: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="M3.8 10.9 12 4.2l8.2 6.7" />
      <path d="M5.9 10.2V19a1.3 1.3 0 0 0 1.3 1.3h9.6A1.3 1.3 0 0 0 18.1 19v-8.8" />
      <path d="M10 20.3v-4.6a2 2 0 0 1 4 0v4.6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.9" cy="10.9" r="6.1" />
      <path d="m15.6 15.6 4.2 4.2" />
    </>
  ),
  library: (
    <>
      <rect x="3.9" y="4.4" width="5.1" height="15.2" rx="1.5" />
      <path d="M14.3 5.2l3.4.9a1.6 1.6 0 0 1 1.1 1.9l-2.9 11.1" />
      <path d="M11.4 19.6h6.7" />
    </>
  ),
  playlist: (
    <>
      <path d="M9.3 16.6V6.4l9-2v9.8" />
      <circle cx="6.7" cy="17.1" r="2.6" />
      <circle cx="15.7" cy="14.2" r="2.6" />
    </>
  ),
  heart: <path d="M12 20.2s-7.3-4.4-7.3-9.6A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.3 3.2c0 5.2-7.3 9.6-7.3 9.6Z" />,
  heartFilled: (
    <path d="M12 20.2s-7.3-4.4-7.3-9.6A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.3 3.2c0 5.2-7.3 9.6-7.3 9.6Z" />
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="7.6" />
      <path d="M12 8.2V12l2.7 1.7" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5.5v13" />
      <path d="M5.5 12h13" />
    </>
  ),
  minus: <path d="M5.5 12h13" />,
  chevronLeft: <path d="M14.5 6.5 9 12l5.5 5.5" />,
  chevronRight: <path d="M9.5 6.5 15 12l-5.5 5.5" />,
  chevronDown: <path d="M6.5 9.5 12 15l5.5-5.5" />,
  chevronUp: <path d="M6.5 14.5 12 9l5.5 5.5" />,
  bell: (
    <>
      <path d="M18 16.2V11a6 6 0 0 0-12 0v5.2l-1.3 2.1h14.6Z" />
      <path d="M10 19.4a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  play: <path d="M8.2 5.4a.7.7 0 0 1 1.05-.6l10 6.6a.7.7 0 0 1 0 1.2l-10 6.6a.7.7 0 0 1-1.05-.6Z" />,
  pause: (
    <>
      <rect x="7.4" y="5.2" width="3.4" height="13.6" rx="1.3" />
      <rect x="13.2" y="5.2" width="3.4" height="13.6" rx="1.3" />
    </>
  ),
  skipBack: (
    <path d="M18.6 6.3a.8.8 0 0 1 1.2.7v10a.8.8 0 0 1-1.2.7l-7.2-5a.8.8 0 0 1 0-1.4Zm-9.2-.5a1 1 0 0 1 2 0v12.4a1 1 0 0 1-2 0Z" />
  ),
  skipForward: (
    <path d="M5.4 6.3a.8.8 0 0 0-1.2.7v10a.8.8 0 0 0 1.2.7l7.2-5a.8.8 0 0 0 0-1.4Zm9.2-.5a1 1 0 0 0-2 0v12.4a1 1 0 0 0 2 0Z" />
  ),
  shuffle: (
    <>
      <path d="M16.6 4.6 20 8l-3.4 3.4" />
      <path d="M3.8 8h2.6c1.4 0 2.4.6 3.2 1.8l3.6 5.4c.8 1.2 1.8 1.8 3.2 1.8h3.6" />
      <path d="M3.8 16.6h2.6c1.4 0 2.4-.6 3.2-1.8l.7-1.05" />
      <path d="m13.1 9.4.7-1.05C14.6 7.15 15.6 6.5 17 6.5h3" />
    </>
  ),
  repeat: (
    <>
      <path d="M5.4 9.6A4 4 0 0 1 9.3 6h9.3" />
      <path d="m15.8 3.2 2.9 2.9-2.9 2.9" />
      <path d="M18.6 14.4A4 4 0 0 1 14.7 18H5.4" />
      <path d="m8.2 20.8-2.9-2.9 2.9-2.9" />
    </>
  ),
  repeatOne: (
    <>
      <path d="M5.4 9.6A4 4 0 0 1 9.3 6h9.3" />
      <path d="m15.8 3.2 2.9 2.9-2.9 2.9" />
      <path d="M18.6 14.4A4 4 0 0 1 14.7 18H5.4" />
      <path d="m8.2 20.8-2.9-2.9 2.9-2.9" />
      <path d="M12.4 14.6l1.2-.9V10l-1.4.9" />
    </>
  ),
  volumeHigh: (
    <>
      <path d="M4.4 9.6h2.8l3.6-3.1v11l-3.6-3.1H4.4Z" />
      <path d="M14.4 9.4a3.7 3.7 0 0 1 0 5.2" />
      <path d="M17 6.9a7.2 7.2 0 0 1 0 10.2" />
    </>
  ),
  volumeLow: (
    <>
      <path d="M4.4 9.6h2.8l3.6-3.1v11l-3.6-3.1H4.4Z" />
      <path d="M14.4 9.4a3.7 3.7 0 0 1 0 5.2" />
    </>
  ),
  volumeMute: (
    <>
      <path d="M4.4 9.6h2.8l3.6-3.1v11l-3.6-3.1H4.4Z" />
      <path d="m15 10 4 4" />
      <path d="m19 10-4 4" />
    </>
  ),
  queue: (
    <>
      <path d="M4.2 7.2h11" />
      <path d="M4.2 12h11" />
      <path d="M4.2 16.8h7" />
      <path d="M18.6 12.4v7.2" />
      <path d="m16.4 14.6 2.2-2.2 2.2 2.2" />
    </>
  ),
  sliders: (
    <>
      <path d="M5 8.4h9.6" />
      <path d="M18 8.4h1.4" />
      <path d="M5 15.6h3.4" />
      <path d="M11.8 15.6h7.6" />
      <circle cx="16.2" cy="8.4" r="1.9" />
      <circle cx="10" cy="15.6" r="1.9" />
    </>
  ),
  equalizer: (
    <>
      <path d="M6 19V12" />
      <path d="M10 19V6.5" />
      <path d="M14 19v-8" />
      <path d="M18 19V9.5" />
    </>
  ),
  more: (
    <>
      <circle cx="5.6" cy="12" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="18.4" cy="12" r="1.5" />
    </>
  ),
  close: (
    <>
      <path d="m6.4 6.4 11.2 11.2" />
      <path d="m17.6 6.4-11.2 11.2" />
    </>
  ),
  winMinimize: <path d="M6 12h12" />,
  winMaximize: <rect x="6.4" y="6.4" width="11.2" height="11.2" rx="1.8" />,
  winRestore: (
    <>
      <rect x="4.6" y="8.4" width="9.6" height="9.6" rx="1.6" />
      <path d="M9.4 6.4h8.9a1.4 1.4 0 0 1 1.4 1.4v8.7" />
    </>
  ),
  check: <path d="m5.6 12.6 4.2 4.2 8.6-9.6" />,
  download: (
    <>
      <path d="M12 4.6v10.2" />
      <path d="m8.2 11.4 3.8 3.8 3.8-3.8" />
      <path d="M4.8 19.4h14.4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.8 7.6h14.4" />
      <path d="M9.4 7.6V5.9a1.3 1.3 0 0 1 1.3-1.3h2.6a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.6 7.6l.8 11a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3l.8-11" />
    </>
  ),
  pencil: (
    <>
      <path d="M15.9 5.2l2.9 2.9" />
      <path d="M4.9 19.2l.9-4 9.2-9.2a1.5 1.5 0 0 1 2.1 0l1 1a1.5 1.5 0 0 1 0 2.1l-9.2 9.2Z" />
    </>
  ),
  externalLink: (
    <>
      <path d="M14 5.4h4.6V10" />
      <path d="M18.2 5.8 11 13" />
      <path d="M17 13.6v3.9a1.5 1.5 0 0 1-1.5 1.5H6.9a1.5 1.5 0 0 1-1.5-1.5V8.9a1.5 1.5 0 0 1 1.5-1.5h3.9" />
    </>
  ),
  music: (
    <>
      <path d="M9.6 17V6.6l8.8-2v10.2" />
      <circle cx="7" cy="17.5" r="2.6" />
      <circle cx="15.8" cy="14.8" r="2.6" />
    </>
  ),
  mic: (
    <>
      <rect x="9.2" y="3.6" width="5.6" height="10.6" rx="2.8" />
      <path d="M5.8 11.6a6.2 6.2 0 0 0 12.4 0" />
      <path d="M12 17.8v2.6" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="2.9" />
      <path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a1.9 1.9 0 1 1-2.7 2.7l-.1-.1a1.6 1.6 0 0 0-2.8 1.2 1.9 1.9 0 1 1-3.8 0 1.6 1.6 0 0 0-2.8-1.2l-.1.1a1.9 1.9 0 1 1-2.7-2.7l.1-.1a1.6 1.6 0 0 0-1.2-2.8 1.9 1.9 0 1 1 0-3.8 1.6 1.6 0 0 0 1.2-2.8l-.1-.1a1.9 1.9 0 1 1 2.7-2.7l.1.1a1.6 1.6 0 0 0 2.8-1.2 1.9 1.9 0 1 1 3.8 0 1.6 1.6 0 0 0 2.8 1.2l.1-.1a1.9 1.9 0 1 1 2.7 2.7l-.1.1a1.6 1.6 0 0 0 1.2 2.8 1.9 1.9 0 1 1 0 3.8 1.6 1.6 0 0 0-1.3 1.1Z" />
    </>
  ),
  keyboard: (
    <>
      <rect x="3.4" y="6.6" width="17.2" height="10.8" rx="2" />
      <path d="M7 10.2h.01M10.2 10.2h.01M13.4 10.2h.01M16.6 10.2h.01M8.4 13.8h7.2" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3.8l6.6 2.4v5.3c0 4-2.7 7.4-6.6 8.7-3.9-1.3-6.6-4.7-6.6-8.7V6.2Z" />
      <path d="m9.4 12.1 1.9 1.9 3.5-3.9" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3.8a8.2 8.2 0 0 0 0 16.4c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.7-1.7 1.7-1.7h1.8a3.4 3.4 0 0 0 3.4-3.4c0-4-3.4-7.2-7.6-7.2Z" />
      <path d="M7.4 12.4h.01M9.6 8.6h.01M13.6 7.6h.01M16.6 10.4h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <path d="M12 11v5.2" />
      <path d="M12 8.2h.01" />
    </>
  ),
  refresh: (
    <>
      <path d="M19.2 12a7.2 7.2 0 1 1-2.4-5.4" />
      <path d="M19.6 4.6v4.6h-4.6" />
    </>
  ),
  grip: (
    <>
      <circle cx="9.2" cy="7.4" r="1.2" />
      <circle cx="14.8" cy="7.4" r="1.2" />
      <circle cx="9.2" cy="12" r="1.2" />
      <circle cx="14.8" cy="12" r="1.2" />
      <circle cx="9.2" cy="16.6" r="1.2" />
      <circle cx="14.8" cy="16.6" r="1.2" />
    </>
  ),
  expand: (
    <>
      <path d="M9.2 4.6H4.6v4.6" />
      <path d="M14.8 19.4h4.6v-4.6" />
      <path d="M4.6 4.6l5.2 5.2" />
      <path d="M19.4 19.4l-5.2-5.2" />
    </>
  ),
  collapse: (
    <>
      <path d="M4.6 9.2h4.6V4.6" />
      <path d="M19.4 14.8h-4.6v4.6" />
      <path d="M9.2 9.2 4.6 4.6" />
      <path d="M14.8 14.8l4.6 4.6" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="9" r="3.6" />
      <path d="M5.4 19.4a6.6 6.6 0 0 1 13.2 0" />
    </>
  ),
  album: (
    <>
      <circle cx="12" cy="12" r="7.8" />
      <circle cx="12" cy="12" r="2.2" />
    </>
  ),
  trending: (
    <>
      <path d="M4.4 15.4 9.4 10l3.4 3.4 6.8-7" />
      <path d="M15.4 6.4h4.6V11" />
    </>
  ),
  sparkle: (
    <>
      <path d="M12 4.2l1.5 4.1 4.1 1.5-4.1 1.5L12 15.4l-1.5-4.1L6.4 9.8l4.1-1.5Z" />
      <path d="M18.4 15.6l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7Z" />
    </>
  ),
  cast: (
    <>
      <path d="M4.6 8.2V6.6a1.6 1.6 0 0 1 1.6-1.6h11.6a1.6 1.6 0 0 1 1.6 1.6v10.8a1.6 1.6 0 0 1-1.6 1.6h-4.4" />
      <path d="M4.6 12.4a6.4 6.4 0 0 1 6.4 6.4" />
      <path d="M4.6 16a2.8 2.8 0 0 1 2.8 2.8" />
      <path d="M4.6 19.4h.01" />
    </>
  ),
  sort: (
    <>
      <path d="M7.6 5.6v12.8" />
      <path d="m4.6 15.4 3 3 3-3" />
      <path d="M13.4 7.4h6" />
      <path d="M13.4 11.8h4.4" />
      <path d="M13.4 16.2h3" />
    </>
  ),
}

export type IconProps = {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
  title?: string
}

export function Icon({ name, size = 18, strokeWidth = 1.6, className, title }: IconProps) {
  const filled = FILLED.has(name)
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={filled ? undefined : strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      focusable="false"
    >
      {title ? <title>{title}</title> : null}
      {PATHS[name]}
    </svg>
  )
}
