/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Stoody dark theme colors - warmer, cozier grays
        gray: {
          700: '#576574',  // border-emphasis
          750: '#464f5b',  // border-default
          800: '#353b48',  // bg-surface
          850: '#2f3640',  // bg-elevated
          900: '#2d3436',  // bg-deep (main background)
          950: '#262b30',  // deeper shade
        },
        // Blurple (primary accent) - soft indigo
        blurple: {
          300: '#c4bfff',
          400: '#a29bfe',  // main accent
          500: '#6c5ce7',  // hover/active
          600: '#5849be',
          700: '#4834d4',
        },
        // Mint (secondary accent) - fresh green
        mint: {
          300: '#81f5d8',
          400: '#55efc4',  // main accent
          500: '#00b894',  // hover/active
          600: '#00a884',
          700: '#009674',
        },
        // Pink (tertiary accent) - exciting hover color!
        pink: {
          300: '#ff9cc2',
          400: '#ff69b4',  // hot pink - the star of Stoody!
          500: '#e84393',
          600: '#d63384',
        },
        // Coral (warm accent) - friendly peach
        coral: {
          300: '#ffd0c4',
          400: '#fab1a0',  // soft coral
          500: '#e17055',
          600: '#d35400',
        },
        // Sky (cool accent) - calm blue
        sky: {
          300: '#a4d4ff',
          400: '#74b9ff',  // sky blue
          500: '#0984e3',
          600: '#0066cc',
        },
        // Warning yellow
        warning: {
          300: '#fff3bf',
          400: '#ffeaa7',
          500: '#fdcb6e',
          600: '#f9ca24',
        },
        // Error/danger red - soft salmon
        danger: {
          300: '#ffb4b4',
          400: '#ff7675',  // soft red
          500: '#d63031',
          600: '#c0392b',
        },
      },
      fontFamily: {
        sans: ['Nunito', 'Segoe UI', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'Monaco', 'monospace'],
      },
      // Stoody generous spacing scale
      spacing: {
        '4.5': '18px',
        '5.5': '22px',
        '7': '28px',
        '18': '72px',
        '22': '88px',
      },
      // Stoody rounded corners
      borderRadius: {
        'stoody-sm': '8px',
        'stoody': '16px',
        'stoody-lg': '24px',
        'stoody-xl': '32px',
      },
      // Stoody soft shadows
      boxShadow: {
        'stoody-sm': '0 2px 4px rgba(0,0,0,0.1)',
        'stoody': '0 4px 12px rgba(0,0,0,0.15)',
        'stoody-lg': '0 8px 24px rgba(0,0,0,0.2)',
        'stoody-glow': '0 0 20px rgba(162, 155, 254, 0.15)',
      },
      // Padding/gap utilities
      padding: {
        'stoody-xs': '6px',
        'stoody-sm': '12px',
        'stoody-md': '20px',
        'stoody-lg': '32px',
        'stoody-xl': '48px',
      },
      gap: {
        'stoody-xs': '6px',
        'stoody-sm': '12px',
        'stoody-md': '20px',
        'stoody-lg': '32px',
      },
    },
  },
  plugins: [],
}
