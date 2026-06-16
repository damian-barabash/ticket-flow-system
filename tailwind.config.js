/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // editorial-dark palette
        bg: '#0A0A0B',          // near-black canvas
        surface: '#141416',     // raised panels / cards
        surface2: '#1B1B1E',    // inputs, hover
        line: '#262629',        // hairline borders
        line2: '#34343A',       // stronger hairline
        ink: '#EDEDED',         // primary text
        muted: '#8A8A92',       // secondary text
        faint: '#55555C',       // micro labels
        accent: '#FF2E2E',      // logo red
        accentSoft: 'rgba(255,46,46,0.12)',
        ok: '#3FB950',          // done / available
        warn: '#E3B341',        // in progress
        legend: '#A974FF',      // legendary violet (goals / deadlines)
        legendSoft: 'rgba(169,116,255,0.10)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        label: '0.22em',
      },
      borderRadius: {
        xl2: '14px',
      },
    },
  },
  plugins: [],
}
