import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const preset = require("../tailwind-preset");

const config: Config = {
  presets: [preset],
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../component/src/**/*.{js,ts,jsx,tsx}",
  ],
  plugins: [
    tailwindcssAnimate,
  ],
};

export default config;
