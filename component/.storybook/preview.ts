import type { Preview } from "@storybook/react-vite";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    // Every story is an axe run in real Chromium, and a violation fails it
    // (#1505). Exemptions are per story or per file, each carrying the issue
    // that owns the fix — today all ten point at #1676, the accessible-name
    // gap on role=combobox triggers. Add one only with an issue number.
    a11y: { test: "error" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  globalTypes: {
    theme: {
      description: "Toggle light / dark / system mode",
      toolbar: {
        title: "Theme",
        icon: "circlehollow",
        items: [
          { value: "light", icon: "sun", title: "Light" },
          { value: "dark", icon: "moon", title: "Dark" },
          { value: "system", icon: "mirror", title: "System" },
        ],
        dynamicTitle: true,
      },
    },
  },
  initialGlobals: {
    theme: "system",
  },
  decorators: [
    (Story, context) => {
      const theme = context.globals.theme ?? "system";
      const isDark =
        theme === "dark" ||
        (theme === "system" &&
          globalThis.matchMedia?.("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", isDark);
      return Story();
    },
  ],
};

export default preview;
