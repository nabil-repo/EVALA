import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f5f3ff',
          100: '#ede9fe',
          200: '#ddd6fe',
          300: '#c4b5fd',
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#7c3aed',
          700: '#6d28d9',
          800: '#5b21b6',
          900: '#4c1d95',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display': ['4.5rem', { lineHeight: '1.1', fontWeight: '200' }],
        'display-sm': ['3rem', { lineHeight: '1.2', fontWeight: '200' }],
      },
      boxShadow: {
        'neuro': '12px 12px 24px rgba(0, 0, 0, 0.08), -12px -12px 24px rgba(255, 255, 255, 0.95)',
        'neuro-sm': '6px 6px 12px rgba(0, 0, 0, 0.06), -6px -6px 12px rgba(255, 255, 255, 0.9)',
        'neuro-lg': '20px 20px 40px rgba(0, 0, 0, 0.1), -20px -20px 40px rgba(255, 255, 255, 1)',
        'inner-neuro': 'inset 4px 4px 8px rgba(0, 0, 0, 0.05), inset -4px -4px 8px rgba(255, 255, 255, 0.9)',
        'glow-blue': '0 0 30px rgba(96, 165, 250, 0.3)',
        'glow-purple': '0 0 30px rgba(139, 92, 246, 0.3)',
      },
    }
  },
  plugins: []
}
export default config
