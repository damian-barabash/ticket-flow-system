// Ticket Flow icon set — 24×24 line icons, square caps/joins (brand: 90° corners).
// Every icon inherits currentColor; size via `size`.
const P = {
  close: 'M6 6l12 12M18 6L6 18',
  back: 'M15 5l-7 7 7 7',
  forward: 'M9 5l7 7-7 7',
  up: 'M5 15l7-7 7 7',
  down: 'M5 9l7 7 7-7',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  check: 'M4.5 12.5l5 5 10-11',
  checkCircle: 'M4 4h16v16H4zM8 12.5l3 3 5-6',
  trash: 'M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6',
  pencil: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  calendar: 'M4 5h16v15H4zM4 9.5h16M8 3v4M16 3v4',
  chat: 'M4 4h16v12H9l-5 4V4zM8 9h8M8 12h5',
  bell: 'M6 16V10a6 6 0 0112 0v6l2 2H4l2-2zM10 20h4',
  bellOff: 'M6 16V10a6 6 0 019.5-4.9M18 10v6l2 2H8M10 20h4M3 3l18 18',
  user: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21v-1a6 6 0 016-6h4a6 6 0 016 6v1',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 016-6h2a6 6 0 016 6v1M16 3.5a4 4 0 010 7.5M22 21v-1a6 6 0 00-4-5.6',
  userPlus: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21v-1a6 6 0 016-6h2a6 6 0 016 6v1M19 8v6M16 11h6',
  search: 'M10.5 17a6.5 6.5 0 100-13 6.5 6.5 0 000 13zM15.5 15.5L21 21',
  filter: 'M3 5h18l-7 8v6l-4 2v-8L3 5z',
  sort: 'M7 4v16M3 16l4 4 4-4M17 20V4M13 8l4-4 4 4',
  menu: 'M3 6h18M3 12h18M3 18h18',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  logout: 'M15 4h5v16h-5M10 8l-4 4 4 4M6 12h11',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  image: 'M4 4h16v16H4zM4 16l5-5 4 4 2-2 5 5M15 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z',
  paperclip: 'M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7',
  send: 'M3 11l18-8-8 18-2-8-8-2z',
  download: 'M12 4v11M7 10l5 5 5-5M4 20h16',
  upload: 'M12 20V9M7 14l5-5 5 5M4 4h16',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  folder: 'M3 5h7l2 2h9v13H3z',
  archive: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  restore: 'M4 12a8 8 0 108-8 8 8 0 00-6 2.7M4 4v4h4',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  star: 'M12 3l2.7 5.6 6.1.8-4.5 4.2 1.1 6-5.4-2.9-5.4 2.9 1.1-6L3.2 9.4l6.1-.8L12 3z',
  target: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 16a4 4 0 100-8 4 4 0 000 8zM12 12h.01',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  pin: 'M12 21s-7-6.3-7-12a7 7 0 0114 0c0 5.7-7 12-7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  ticket: 'M4 4h5a3 3 0 006 0h5v7a1.5 1.5 0 000 3v6h-5a3 3 0 00-6 0H4v-6a1.5 1.5 0 000-3V4z',
  tasks: 'M9 6h11M9 12h11M9 18h11M4 5l1 1 2-2M4 11l1 1 2-2M4 17l1 1 2-2',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  list: 'M4 6h16M4 12h16M4 18h16',
  refresh: 'M20 12a8 8 0 11-2.3-5.7M20 4v4h-4',
  globe: 'M12 21a9 9 0 100-18 9 9 0 000 18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z',
  lock: 'M5 11h14v10H5zM8 11V7a4 4 0 018 0v4',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  phone: 'M5 3h4l2 5-2.5 1.5a11 11 0 006 6L16 13l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2z',
  inbox: 'M3 13l3-9h12l3 9M3 13v7h18v-7M3 13h5l1 3h6l1-3h5',
  arrowRight: 'M4 12h16M14 6l6 6-6 6',
  arrowLeft: 'M20 12H4M10 6l-6 6 6 6',
  reply: 'M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  card: 'M3 5h18v14H3zM3 10h18',
  version: 'M4 4h7l9 9-7 7-9-9V4zM8 8h.01',
  zap: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  sparkle: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01',
  alert: 'M12 3l10 18H2L12 3zM12 10v5M12 18h.01',
  dot: 'M12 12h.01',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  hash: 'M5 9h14M5 15h14M10 4L8 20M16 4l-2 16',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
  split: 'M4 4h16v16H4zM14 4v16',
  home: 'M3 11l9-8 9 8M5 9.5V21h14V9.5',
  key: 'M14 10a4 4 0 10-3.5 3.96L9 15.5V18H6.5v2.5H3V17l6.6-6.6A4 4 0 0014 10zM15.5 8.5h.01',
}

export function Icon({ name, size = 18, stroke = 1.75, className = '', title }) {
  const d = P[name]
  if (!d) return null
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="square"
      strokeLinejoin="miter"
      className={`shrink-0 ${className}`}
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
    >
      {title && <title>{title}</title>}
      <path d={d} />
    </svg>
  )
}

// Hand-drawn white scribble arrow (landing accent, like the reference).
export function ScribbleArrow({ className = '', width = 120 }) {
  return (
    <svg width={width} viewBox="0 0 120 48" fill="none" className={className} aria-hidden="true">
      <path d="M116 10C90 8 52 14 14 30" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      <path d="M30 14L10 31l24 4" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 44c26-4 60-6 100-4" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  )
}
