import type { Config } from 'tailwindcss';

export default {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: {
          DEFAULT: '#1A1830',
          text: '#A89BC2',
          active: '#F0EAF8',
          border: 'rgba(255,255,255,0.06)',
        },
        primary: { DEFAULT: '#C2185B', foreground: '#FFFFFF' },
        secondary: { DEFAULT: '#7C3AED', foreground: '#FFFFFF' },
        page: '#F8F7FC',
        surface: '#FFFFFF',
        border: { DEFAULT: '#EEEBF5', hover: '#D8D4EC' },
        muted: { DEFAULT: '#EEEBF5', foreground: '#6B7280' },
      },
      // Heebo carries Hebrew and matches Inter's metrics, so mixed strings like
      // "בדיקת AI" render in one typeface instead of two.
      fontFamily: { sans: ['Heebo', 'Inter', 'sans-serif'] },
      borderRadius: {
        card: '12px',
        input: '8px',
        badge: '20px',
      },
    },
  },
  // Without this every `prose` class in MarkdownRenderer is inert, so lesson
  // content, AI reviews and feedback rendered as one undifferentiated blob.
  plugins: [require('@tailwindcss/typography')],
} satisfies Config;
