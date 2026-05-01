/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#0b0d10',
        panel: '#13171c',
        line: '#1f2630',
        muted: '#7a8595',
        accent: '#d4af37',
      },
    },
  },
  plugins: [],
};
