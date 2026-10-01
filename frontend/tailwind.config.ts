import type { Config } from 'tailwindcss';

// Colours come from the CSS custom properties in src/index.css so dark mode
// and the semantic tones work the same in Tailwind classes and inline styles.
const v = (name: string) => `var(--${name})`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'] },
      colors: {
        app: v('bg-app'),
        card: v('bg-card'),
        elevated: v('bg-elevated'),
        subtle: v('bg-subtle'),
        line: v('border'),
        'line-subtle': v('border-subtle'),
        ink: v('text-primary'),
        'ink-2': v('text-secondary'),
        muted: v('text-muted'),
        faint: v('text-tertiary'),
        link: v('text-link'),
        brand: { DEFAULT: v('brand'), strong: v('brand-strong'), soft: v('brand-soft'), fg: v('brand-fg') },
      },
      boxShadow: { sm: v('shadow-sm'), md: v('shadow-md') },
    },
  },
  plugins: [],
} satisfies Config;
