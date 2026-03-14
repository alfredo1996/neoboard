// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require("../tailwind-preset");

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  darkMode: ["class"],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  plugins: [require("tailwindcss-animate")],
}
