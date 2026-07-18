import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // App chrome, not part of the shadcn token set — the sidebar is a fixed
        // dark surface rather than a themeable semantic role.
        sidebar: {
          DEFAULT: '#1A1830',
          text: '#A89BC2',
          active: '#F0EAF8',
          border: 'rgba(255,255,255,0.06)',
        },
        page: '#F8F7FC',
        surface: '#FFFFFF',

        // shadcn semantic tokens. `<alpha-value>` is what makes `bg-primary/40`
        // work; the channels themselves live in globals.css.
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--card) / <alpha-value>)',
          foreground: 'rgb(var(--card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--popover) / <alpha-value>)',
          foreground: 'rgb(var(--popover-foreground) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          foreground: 'rgb(var(--accent-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--border) / <alpha-value>)',
          hover: '#D8D4EC',
        },
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
      // Heebo carries Hebrew and matches Inter's metrics, so mixed strings like
      // "בדיקת AI" render in one typeface instead of two.
      fontFamily: { sans: ['Heebo', 'Inter', 'sans-serif'] },
      borderRadius: {
        // shadcn's scale, driven by --radius.
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
        // App radii still referenced by markup not yet on shadcn components.
        card: '12px',
        input: '8px',
        badge: '20px',
      },
    },
  },
  plugins: [
    // Without this every `prose` class in MarkdownRenderer is inert, so lesson
    // content, AI reviews and feedback rendered as one undifferentiated blob.
    require('@tailwindcss/typography'),
    // Supplies the enter/exit utilities Radix components animate with
    // (data-[state=open]:animate-in, fade-out-0, zoom-in-95, ...).
    require('tailwindcss-animate'),
  ],
} satisfies Config;
