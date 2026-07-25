import type { Config } from 'tailwindcss';

/*
  "קליק כיתה" design system.

  Palette stored as space-separated RGB channels in globals.css, surfaced here as
  `rgb(var(--x) / <alpha-value>)` so opacity modifiers (`bg-clay/20`) resolve.
*/
const c = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Chip/meter colors are built dynamically per status, so JIT can't see them.
  safelist: [
    { pattern: /^(bg|text|border)-(ground|sheet|ink|ink-soft|rule|clay|indigo|sage|butter|coral)$/ },
    // Per-card accent spines are built dynamically (before:bg-clay …).
    { pattern: /^before:bg-(clay|indigo|sage|butter|coral)$/ },
  ],
  theme: {
    extend: {
      colors: {
        ground: c('ground'),
        sheet: c('sheet'),
        ink: { DEFAULT: c('ink'), soft: c('ink-soft') },
        rule: c('rule'),
        clay: c('clay'),
        indigo: c('indigo'),
        sage: c('sage'),
        butter: c('butter'),
        coral: c('coral'),

        // shadcn semantic tokens mapped onto the palette so ui/* primitives resolve.
        background: c('ground'),
        foreground: c('ink'),
        card: { DEFAULT: c('sheet'), foreground: c('ink') },
        popover: { DEFAULT: c('sheet'), foreground: c('ink') },
        primary: { DEFAULT: c('ink'), foreground: c('sheet') },
        secondary: { DEFAULT: c('clay'), foreground: c('sheet') },
        muted: { DEFAULT: c('ground'), foreground: c('ink-soft') },
        accent: { DEFAULT: c('clay'), foreground: c('sheet') },
        destructive: { DEFAULT: c('coral'), foreground: c('sheet') },
        border: c('rule'),
        input: c('rule'),
        ring: c('clay'),
      },

      fontFamily: {
        // Heebo everywhere — clean geometric Hebrew. `display` = Heebo 700/800.
        sans: ['Heebo', 'sans-serif'],
        serif: ['Heebo', 'sans-serif'],
        display: ['Heebo', 'sans-serif'],
      },

      borderRadius: {
        none: '0px',
        sm: '4px',
        DEFAULT: '7px',
        md: '7px',
        lg: '10px',
        xl: '12px',
        '2xl': '14px',
        card: '3px',
        input: '7px',
        badge: '9999px',
        full: '9999px',
      },

      boxShadow: {
        soft: 'var(--shadow-soft)',
        sheet: 'var(--shadow-sheet)',
        lift: 'var(--shadow-lift)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
      },
      animation: { 'fade-in': 'fade-in 160ms ease' },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
} satisfies Config;
