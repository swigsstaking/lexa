/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        lexa: {
          ink: '#0B0F14',
          bg: '#F7F7F5',
          surface: '#FFFFFF',
          border: '#E5E5E0',
          primary: '#D4342C',
          primaryDark: '#A51B16',
          accent: '#F2C14E',
          muted: '#6B6B6B',
          success: '#16A34A',
          danger: '#DC2626',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        display: ['Fraunces', 'Georgia', 'serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(11,15,20,0.04), 0 8px 24px rgba(11,15,20,0.06)',
      },
    },
  },
  plugins: [],
};
