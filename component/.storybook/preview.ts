import type { Preview } from "@storybook/react-vite";
import "../src/index.css";

const preview: Preview = {
  parameters: {
    // 'todo' reports every axe violation without failing the run. The gate is
    // not 'error' yet because it costs 68 of 400 stories today, in two piles
    // that are different work: stories that render a primitive with no label
    // (a story artifact — Switch/Default is a bare <Switch>), and real token
    // debt (color-contrast on the success/warning/destructive pairs). The
    // burn-down and the flip to 'error' belong to #1505.
    a11y: { test: "todo" },
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
