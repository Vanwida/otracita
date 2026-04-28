import type { Config } from 'tailwindcss'

// otracita brand colors — mismas que la PWA web (var en globals.css).
// Aquí los hard-codeo porque la app móvil es bundle estático.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: '#FAF7F2',
        surface: '#FFFFFF',
        overlay: '#F0EBE3',
        line: '#E8DDD0',
        'line-strong': '#D4C5B0',
        ink: '#2A1D14',
        'ink-2': '#6B5D4F',
        'ink-3': '#9C8F7E',
        brand: '#C9653C',
        'brand-strong': '#A84F2C',
        'brand-softer': '#F4E3D4',
        'brand-ink': '#FFFFFF',
        success: '#3F7A4D',
        warning: '#B8791C',
        danger: '#A33B2D',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
        display: ['Georgia', 'serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
