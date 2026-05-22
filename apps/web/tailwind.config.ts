import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: 'var(--ink)',
          // Numeric tone scale (2/3/4) follows the design's editorial naming.
          2: 'var(--ink-2)',
          3: 'var(--ink-3)',
          4: 'var(--ink-4)',
          inv: 'var(--ink-inv)',
        },
        // `ink-soft` kept as a legacy alias of --ink-2 so existing className
        // strings like `text-ink-soft` continue to resolve.
        'ink-soft': 'var(--ink-soft)',
        surface: {
          DEFAULT: 'var(--surface)',
          2: 'var(--surface-2)',
          3: 'var(--surface-3)',
          sunk: 'var(--surface-sunk)',
        },
        canvas: 'var(--canvas)',
        line: {
          DEFAULT: 'var(--line)',
          soft: 'var(--line-soft)',
          strong: 'var(--line-strong)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          mid: 'var(--accent-mid)',
          pale: 'var(--accent-pale)',
        },
        sage: {
          DEFAULT: 'var(--sage)',
          deep: 'var(--sage-deep)',
          soft: 'var(--sage-soft)',
          tint: 'var(--sage-tint)',
          'tint-2': 'var(--sage-tint-2)',
        },
        sand: {
          DEFAULT: 'var(--sand)',
          soft: 'var(--sand-soft)',
        },
        terracotta: 'var(--terracotta)',
        rose: 'var(--rose)',
        plum: {
          DEFAULT: 'var(--plum)',
          pale: 'var(--plum-pale)',
        },
        sky: {
          DEFAULT: 'var(--sky)',
          soft: 'var(--sky-soft)',
          pale: 'var(--sky-pale)',
        },
        warm: {
          pale: 'var(--warm-pale)',
        },
        red: {
          DEFAULT: 'var(--red)',
          pale: 'var(--red-pale)',
        },
        amber: {
          DEFAULT: 'var(--amber)',
          pale: 'var(--amber-pale)',
        },
        green: {
          DEFAULT: 'var(--green)',
          pale: 'var(--green-pale)',
        },
        placeholder: 'var(--placeholder)',
      },
      spacing: {
        s1: 'var(--s1)',
        s2: 'var(--s2)',
        s3: 'var(--s3)',
        s4: 'var(--s4)',
        s5: 'var(--s5)',
        s6: 'var(--s6)',
        s8: 'var(--s8)',
        s10: 'var(--s10)',
        s12: 'var(--s12)',
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        lg: 'var(--shadow-lg)',
        focus: 'var(--focus-ring)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'Times New Roman', 'serif'],
      },
      transitionDuration: {
        fast: '150ms',
        base: '200ms',
        slow: '350ms',
      },
    },
  },
  plugins: [],
};

export default config;
