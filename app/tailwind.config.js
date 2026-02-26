/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Grotesque + technical mono pairing
        sans: ['Geist Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'JetBrains Mono', 'SFMono-Regular', 'monospace'],
      },
      borderRadius: {
        lg: '0.5rem',
        md: '0.25rem',
        sm: '0.125rem',
      },
      colors: {
        background: '#09090b', // bg-canvas
        foreground: '#fafafa', // text-primary
        canvas: '#09090b',
        surface: '#18181b',
        'border-subtle': '#27272a',
        'border-strong': '#3f3f46',
        'text-primary': '#fafafa',
        'text-secondary': '#a1a1aa',
        'text-muted': '#52525b',
        primary: {
          DEFAULT: '#f59e0b',
          foreground: '#171717',
        },
        'primary-glow': '#451a03',
        muted: {
          DEFAULT: '#27272a',
          foreground: '#a1a1aa',
        },
        card: {
          DEFAULT: '#18181b',
          foreground: '#fafafa',
        },
        success: '#10b981',
        error: '#ef4444',
        info: '#3b82f6',
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
