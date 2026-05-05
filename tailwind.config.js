/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        pt: {
          blue: '#2563eb',
          'blue-dark': '#1d4ed8',
          text: '#0f172a',
          muted: '#64748b',
          border: '#dbe6f3',
          bg: '#ffffff',
          hover: '#eef3fb',
        }
      },
      animation: {
        'fade-in': 'fadeIn 140ms ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
}
