/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--bg-main)',
        surface: 'var(--bg-surface)',
        surfaceHover: 'var(--bg-surface-hover)',
        primary: '#3B82F6',
        primaryDark: '#2563EB',
        textMain: 'var(--text-main)',
        textMuted: 'var(--text-muted)',
        borderFocus: '#3B82F6',
        borderMuted: 'var(--border-muted)'
      }
    },
  },
  plugins: [],
}
