/** @type {import('tailwindcss').Config} */

// Semantic colours are defined as CSS custom properties in globals.css and
// referenced here through the `rgb(var(--x) / <alpha-value>)` form, so Tailwind's
// opacity modifiers (bg-surface/50) keep working. Switching themes then means
// swapping variable values rather than duplicating a `dark:` class on every
// element.
const withOpacity = (variable) => `rgb(var(${variable}) / <alpha-value>)`;

module.exports = {
  // Theme is driven by a `dark` class on <html>, set before paint by the inline
  // script in the root layout. Media-query-only dark mode cannot support an
  // explicit user choice.
  darkMode: 'class',
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Brand: EESA maroon.
        primary: {
          50: '#fdf2f3',
          100: '#fce4e6',
          200: '#f9ccd1',
          300: '#f2a3ac',
          400: '#e56e7f',
          500: '#800020',
          600: '#6b001a',
          700: '#560015',
          800: '#400010',
          900: '#2b000b',
          950: '#1a0006',
        },
        // Brand: EESA gold.
        accent: {
          50: '#fffbeb',
          100: '#fff4c6',
          200: '#ffe888',
          300: '#ffd94a',
          400: '#f5c518',
          500: '#DAA520',
          600: '#b8891a',
          700: '#966e14',
          800: '#74540f',
          900: '#523b0a',
        },

        // Semantic surfaces and text. These flip with the theme.
        canvas: withOpacity('--color-canvas'),          // page background
        surface: withOpacity('--color-surface'),        // cards, panels, bars
        'surface-raised': withOpacity('--color-surface-raised'), // menus, popovers
        muted: withOpacity('--color-muted'),            // chips, hover fills
        'muted-strong': withOpacity('--color-muted-strong'),

        strong: withOpacity('--color-text-strong'),     // headings
        body: withOpacity('--color-text-body'),         // paragraph text
        'muted-fg': withOpacity('--color-text-muted'),  // secondary text
        subtle: withOpacity('--color-text-subtle'),     // captions, metadata
        faint: withOpacity('--color-text-faint'),       // icons, placeholders

        line: withOpacity('--color-line'),              // default border
        'line-strong': withOpacity('--color-line-strong'),

        // Status colours, theme-aware so they stay legible on either ground.
        success: withOpacity('--color-success'),
        'success-soft': withOpacity('--color-success-soft'),
        warning: withOpacity('--color-warning'),
        'warning-soft': withOpacity('--color-warning-soft'),
        danger: withOpacity('--color-danger'),
        'danger-soft': withOpacity('--color-danger-soft'),
        info: withOpacity('--color-info'),
        'info-soft': withOpacity('--color-info-soft'),
      },
      // Tailwind's default border colour is gray-200, so a bare `border-t` or
      // `border` with no colour class renders a light grey line that is invisible
      // in dark mode. Pointing the default at the themed token fixes every such
      // usage without editing them individually.
      borderColor: {
        DEFAULT: withOpacity('--color-line'),
      },
      divideColor: {
        DEFAULT: withOpacity('--color-line'),
      },
      ringOffsetColor: {
        DEFAULT: withOpacity('--color-canvas'),
      },
      fontFamily: {
        // Supplied by next/font in the root layout, which self-hosts the files
        // and avoids the render-blocking request a CSS @import creates.
        sans: ['var(--font-inter)', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        heading: ['var(--font-poppins)', 'var(--font-inter)', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Shadows read as dirt on a dark ground, so the tokens carry their own
        // theme-aware colour.
        card: '0 1px 2px 0 rgb(var(--shadow-color) / 0.06), 0 1px 3px 0 rgb(var(--shadow-color) / 0.08)',
        raised: '0 4px 6px -1px rgb(var(--shadow-color) / 0.08), 0 2px 4px -2px rgb(var(--shadow-color) / 0.06)',
        overlay: '0 10px 15px -3px rgb(var(--shadow-color) / 0.12), 0 4px 6px -4px rgb(var(--shadow-color) / 0.10)',
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'none' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.2s ease-out',
        shimmer: 'shimmer 1.6s infinite',
      },
    },
  },
  plugins: [],
};
