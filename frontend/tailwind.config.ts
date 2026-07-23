import type { Config } from 'tailwindcss';

/*
  Notebook / neo-brutalist design system.

  Every palette color is stored in globals.css as bare oklch channels
  (`L C H`, no wrapping function) so Tailwind can inject the opacity modifier
  via `oklch(var(--x) / <alpha-value>)`. That is what makes `bg-mustard/20`,
  `border-ink/25`, `text-tomato/80`, `bg-paper/85` resolve to valid CSS. Put a
  full `oklch(...)` string in the var and every one of those utilities silently
  drops.
*/
const palette = (name: string) => `oklch(var(--${name}) / <alpha-value>)`;

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Accent classes are built dynamically (`bg-${accent}`) for KPI bars, rubric
  // fills and trend squares, so JIT can't see them in the source. Safelist the
  // palette fills (plain + before: variants) so they always ship.
  safelist: [
    { pattern: /^(bg|text|border|before:bg)-(paper|cream|ink|mustard|cobalt|tomato|forest|lilac|plum)$/ },
  ],
  theme: {
    extend: {
      colors: {
        // Riso-classroom palette. See globals.css for the channel values and
        // the dark ("chalkboard") overrides.
        paper: palette('paper'),
        cream: palette('cream'),
        ink: palette('ink'),
        mustard: palette('mustard'),
        cobalt: palette('cobalt'),
        tomato: palette('tomato'),
        forest: palette('forest'),
        lilac: palette('lilac'),
        plum: palette('plum'),

        // shadcn semantic tokens are kept so the existing ui/* primitives and
        // Radix components keep resolving, now mapped onto the notebook palette.
        background: palette('paper'),
        foreground: palette('ink'),
        card: { DEFAULT: palette('paper'), foreground: palette('ink') },
        popover: { DEFAULT: palette('paper'), foreground: palette('ink') },
        primary: { DEFAULT: palette('ink'), foreground: palette('paper') },
        secondary: { DEFAULT: palette('mustard'), foreground: palette('ink') },
        muted: { DEFAULT: palette('cream'), foreground: 'oklch(var(--ink) / 0.6)' },
        accent: { DEFAULT: palette('mustard'), foreground: palette('ink') },
        destructive: { DEFAULT: palette('tomato'), foreground: palette('paper') },
        border: palette('ink'),
        input: palette('ink'),
        ring: palette('ink'),
      },

      fontFamily: {
        // Rubik is the default body face; the two others are opt-in per element.
        sans: ['Rubik', 'Heebo', 'sans-serif'],
        serif: ['"Frank Ruhl Libre"', 'Georgia', 'serif'],
        mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
        // Aliases that read better in markup than font-serif/font-mono.
        display: ['"Frank Ruhl Libre"', 'Georgia', 'serif'],
      },

      // Nothing is rounded. The only exception is `rounded-full` for status dots,
      // which Tailwind supplies out of the box (9999px), so we leave it untouched.
      borderRadius: {
        none: '0px',
        sm: '0px',
        md: '0px',
        lg: '0px',
        DEFAULT: '0px',
        card: '0px',
        input: '0px',
        badge: '0px',
      },

      borderWidth: {
        DEFAULT: '2px',
        3: '3px',
      },

      // Hard offset shadows, no blur, colored with --ink (or an accent). These
      // are the physical "paper lift" of the whole system.
      boxShadow: {
        'brutal-sm': '3px 3px 0 0 oklch(var(--ink))',
        brutal: '5px 5px 0 0 oklch(var(--ink))',
        'brutal-lg': '8px 8px 0 0 oklch(var(--ink))',
        'brutal-hover': '7px 7px 0 0 oklch(var(--ink))',
        'brutal-press': '1px 1px 0 0 oklch(var(--ink))',
        'brutal-mustard': '5px 5px 0 0 oklch(var(--mustard))',
        'brutal-cobalt': '5px 5px 0 0 oklch(var(--cobalt))',
        'brutal-tomato': '5px 5px 0 0 oklch(var(--tomato))',
        'brutal-forest': '5px 5px 0 0 oklch(var(--forest))',
      },

      transitionTimingFunction: { paper: 'linear' },
      transitionDuration: { paper: '150ms' },

      keyframes: {
        blink: { '0%,49%': { opacity: '1' }, '50%,100%': { opacity: '0.25' } },
        marquee: { from: { transform: 'translateX(0)' }, to: { transform: 'translateX(-50%)' } },
      },
      animation: {
        blink: 'blink 1.2s steps(1, end) infinite',
        // RTL ticker: content is duplicated in markup so 50% is one full loop.
        marquee: 'marquee 40s linear infinite',
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
    require('tailwindcss-animate'),
  ],
} satisfies Config;
