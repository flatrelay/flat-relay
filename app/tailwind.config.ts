import type { Config } from 'tailwindcss';

/**
 * FLAT//RELAY identity: a two-ink print of a flat world.
 * sky = page, deep = recessed surfaces, sun = the one action colour, white = paper ink.
 * Legacy token names (ink, panel, flat, muted) are kept so existing classes map onto the new palette.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sky: '#1230C7',
        deep: '#0B1E8C',
        sun: '#FFC52E',
        white: '#F4F1E4', // paper, not screen white
        ink: '#1230C7', // page background (was near-black)
        panel: '#0B1E8C', // recessed surface
        line: 'rgba(244, 241, 228, 0.24)',
        flat: '#FFC52E', // action / sun
        muted: '#C3CAF2',
        alert: '#FFB4A6',
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
      keyframes: {
        crossing: {
          '0%': { left: '-6%' },
          '100%': { left: '68%' },
        },
      },
      animation: {
        crossing: 'crossing 2.8s cubic-bezier(0.22, 0.8, 0.24, 1) 0.2s both',
      },
    },
  },
  plugins: [],
};

export default config;
