/** @type {import('tailwindcss').Config} */
// Ticket Flow design system v2 (2026-10) — "Momentum": black, signal red, white,
// huge uppercase display type, hairlines. BRAND RULE: every corner is 90° —
// borderRadius is zeroed globally (including rounded-full).
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    borderRadius: {
      none: '0',
      DEFAULT: '0',
      sm: '0',
      md: '0',
      lg: '0',
      xl: '0',
      '2xl': '0',
      '3xl': '0',
      xl2: '0',
      full: '0',
    },
    extend: {
      colors: {
        bg: 'rgb(var(--c-bg) / <alpha-value>)',
        surface: 'rgb(var(--c-surface) / <alpha-value>)',
        surface2: 'rgb(var(--c-surface2) / <alpha-value>)',
        line: 'rgb(var(--c-line) / <alpha-value>)',
        line2: 'rgb(var(--c-line2) / <alpha-value>)',
        ink: 'rgb(var(--c-ink) / <alpha-value>)',
        muted: 'rgb(var(--c-muted) / <alpha-value>)',
        faint: 'rgb(var(--c-faint) / <alpha-value>)',
        accent: 'rgb(var(--c-accent) / <alpha-value>)',
        accentDeep: 'rgb(var(--c-accent-deep) / <alpha-value>)',
        accentSoft: 'rgb(var(--c-accent) / 0.12)',
        ok: 'rgb(var(--c-ok) / <alpha-value>)',
        warn: 'rgb(var(--c-warn) / <alpha-value>)',
        legend: 'rgb(var(--c-legend) / <alpha-value>)',
        legendSoft: 'rgb(var(--c-legend) / 0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Inter Tight"', 'Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // readable floor: nothing in the product goes below 12px
        '2xs': ['12px', '16px'],
      },
      letterSpacing: {
        label: '0.08em',
        tightest: '-0.045em',
      },
      maxWidth: {
        page: '1240px',
      },
      zIndex: {
        drawer: '60',
        over: '70',
      },
    },
  },
  plugins: [],
}
