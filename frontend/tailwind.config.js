/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf2f2',
          100: '#f9e0e0',
          200: '#f2b8b8',
          300: '#e88a8a',
          400: '#d45a5a',
          500: '#800020',
          600: '#6b001a',
          700: '#560015',
          800: '#400010',
          900: '#2b000b',
          950: '#1a0006',
        },
        accent: {
          50: '#fffdf0',
          100: '#fff9d6',
          200: '#fff0a8',
          300: '#ffe57a',
          400: '#ffd84d',
          500: '#DAA520',
          600: '#b8891a',
          700: '#966e14',
          800: '#74540f',
          900: '#523b0a',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        heading: ['Poppins', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
