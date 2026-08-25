import type { Config } from 'tailwindcss'

/**
 * O Tailwind lê os tokens, e não o contrário: `src/styles/tokens.css` é a
 * fonte única da verdade, e uma cor que não estiver lá não existe.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--sb-bg)',
        surface: 'var(--sb-surface)',
        raised: 'var(--sb-surface-raised)',
        line: 'var(--sb-border)',
        ink: 'var(--sb-text)',
        muted: 'var(--sb-text-muted)',
        faint: 'var(--sb-text-faint)',
        accent: 'var(--sb-accent)',
        info: 'var(--sb-info)',
        warning: 'var(--sb-warning)',
        critical: 'var(--sb-critical)',
        public: 'var(--sb-public)',
        sovereign: 'var(--sb-sovereign)',
      },
      fontFamily: {
        ui: 'var(--sb-font-ui)',
        mono: 'var(--sb-font-mono)',
        prose: 'var(--sb-font-prose)',
      },
      fontSize: {
        xs: 'var(--sb-text-xs)',
        sm: 'var(--sb-text-sm)',
        base: 'var(--sb-text-base)',
        lg: 'var(--sb-text-lg)',
        xl: 'var(--sb-text-xl)',
        '2xl': 'var(--sb-text-2xl)',
      },
      letterSpacing: {
        tight: 'var(--sb-track-tight)',
        label: 'var(--sb-track-label)',
      },
      borderRadius: {
        DEFAULT: 'var(--sb-radius)',
        lg: 'var(--sb-radius-lg)',
      },
      backgroundImage: {
        'stripe-warning': 'var(--sb-stripe-warning)',
        'stripe-critical': 'var(--sb-stripe-critical)',
      },
    },
  },
} satisfies Config
