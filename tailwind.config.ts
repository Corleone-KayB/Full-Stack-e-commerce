import type { Config } from 'tailwindcss';

/**
 * AURUM design tokens.
 *
 * Colours are declared as CSS custom properties in globals.css so that light
 * and dark themes swap values, not classnames. Nothing in the app should use a
 * raw hex value — always a token.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: '1.25rem', sm: '1.5rem', lg: '2rem', xl: '2.5rem' },
      screens: { '2xl': '1400px' },
    },
    extend: {
      colors: {
        canvas: 'rgb(var(--canvas) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
        elevated: 'rgb(var(--elevated) / <alpha-value>)',
        ink: 'rgb(var(--ink) / <alpha-value>)',
        muted: 'rgb(var(--muted) / <alpha-value>)',
        faint: 'rgb(var(--faint) / <alpha-value>)',
        hairline: 'rgb(var(--hairline) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--accent) / <alpha-value>)',
          soft: 'rgb(var(--accent-soft) / <alpha-value>)',
          ink: 'rgb(var(--accent-ink) / <alpha-value>)',
        },
        positive: 'rgb(var(--positive) / <alpha-value>)',
        caution: 'rgb(var(--caution) / <alpha-value>)',
        critical: 'rgb(var(--critical) / <alpha-value>)',
        info: 'rgb(var(--info) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-serif', 'Georgia', 'serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.08em' }],
        display: ['clamp(2.75rem, 6vw, 5.25rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        headline: ['clamp(1.75rem, 3.2vw, 2.75rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
      },
      borderRadius: {
        xs: '3px',
        sm: '5px',
        DEFAULT: '7px',
        md: '9px',
        lg: '13px',
        xl: '18px',
      },
      boxShadow: {
        hairline: '0 0 0 1px rgb(var(--hairline) / 1)',
        subtle: '0 1px 2px rgb(0 0 0 / 0.04), 0 4px 12px -4px rgb(0 0 0 / 0.06)',
        lifted: '0 2px 4px rgb(0 0 0 / 0.05), 0 12px 32px -12px rgb(0 0 0 / 0.16)',
        floating: '0 8px 24px -8px rgb(0 0 0 / 0.18), 0 32px 64px -24px rgb(0 0 0 / 0.24)',
        glow: '0 0 0 1px rgb(var(--accent) / 0.35), 0 8px 32px -12px rgb(var(--accent) / 0.4)',
      },
      transitionTimingFunction: {
        premium: 'cubic-bezier(0.22, 1, 0.36, 1)',
        swift: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      keyframes: {
        'fade-up': { from: { opacity: '0', transform: 'translateY(8px)' }, to: { opacity: '1', transform: 'none' } },
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'slide-in-right': { from: { transform: 'translateX(100%)' }, to: { transform: 'none' } },
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'none' } },
        'scale-in': { from: { opacity: '0', transform: 'scale(0.97)' }, to: { opacity: '1', transform: 'none' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.4)', opacity: '0' },
          '100%': { opacity: '0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.22,1,0.36,1) both',
        'fade-in': 'fade-in 0.3s ease both',
        'slide-in-right': 'slide-in-right 0.36s cubic-bezier(0.22,1,0.36,1) both',
        'slide-up': 'slide-up 0.32s cubic-bezier(0.22,1,0.36,1) both',
        'scale-in': 'scale-in 0.22s cubic-bezier(0.22,1,0.36,1) both',
        'pulse-ring': 'pulse-ring 1.8s cubic-bezier(0.4,0,0.6,1) infinite',
      },
    },
  },
  plugins: [],
};

export default config;
