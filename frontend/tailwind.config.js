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
          main: '#1e1e1e',
          panel: '#252526',
          surface: '#333333',
          hover: '#2a2d2e',
        },
        brand: {
          400: '#4daafc',
          500: '#007acc',
          600: '#005a9e',
        },
        txt: {
          main: '#F0F0F0',
          muted: '#C5C5C5',
          dim: '#9E9E9E',
        },
        glass: {
          border: '#333333', // NEW: Softer border color (was #454545)
        }
      },
      boxShadow: {
        'panel': '0 8px 24px rgba(0, 0, 0, 0.2)', // Мягкая тень для объема
      }
    },
  },
  plugins: [],
}
