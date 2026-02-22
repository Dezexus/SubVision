/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        bg: {
          deep: '#0c0c0c',
          main: '#1e1e1e',
          panel: '#252526',
          surface: '#333333',
          hover: '#2a2d2e',
          input: '#3c3c3c',
          'input-hover': '#4b4b4b',
          track: '#18181b',
        },
        brand: {
          400: '#4daafc',
          500: '#007acc',
          600: '#005a9e',
          hover: '#005fb8',
          active: '#04395e',
        },
        txt: {
          main: '#F0F0F0',
          muted: '#C5C5C5',
          dim: '#9E9E9E',
          subtle: '#858585',
        },
        border: {
          main: '#333333',
          strong: '#454545',
          hover: '#6b6b6b',
        }
      },
      boxShadow: {
        'panel': '0 8px 24px rgba(0, 0, 0, 0.2)',
      }
    },
  },
  plugins: [],
}
