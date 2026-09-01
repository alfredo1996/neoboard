const preset = require("./tailwind-preset.cjs");

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./stories/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [require("tailwindcss-animate")],
};
