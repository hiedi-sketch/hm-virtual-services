/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Raleway', 'sans-serif'],
      },
      colors: {
        primary: {
          DEFAULT: '#266b75',
          50: '#e8f4f7',
          100: '#c5e3ea',
          200: '#9fcfdb',
          300: '#74b9cc',
          400: '#4AAFC4',
          500: '#2B7A8B',
          600: '#256d7c',
          700: '#266b75',
          800: '#1f5b64',
          900: '#17454c',
        },
        accent: '#4AAFC4',
        silver: '#B0B5BC',
        greige: '#D8D3CC',
        linen: '#EDE9E3',
      },
      boxShadow: {
        card: '0 1px 3px rgba(43,122,139,0.08), 0 1px 2px rgba(43,122,139,0.06)',
        'card-hover': '0 4px 12px rgba(43,122,139,0.12), 0 2px 4px rgba(43,122,139,0.08)',
      },
    },
  },
  plugins: [],
};
