import { setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import * as projectAnnotations from "./preview";
import { beforeAll, inject } from "vitest";

// `@storybook/addon-a11y` is registered in main.ts, but registering it there
// only wires the Storybook *UI* panel. The axe run that the vitest project
// executes lives in the addon's `afterEach`, which arrives with its preview
// annotations — and addon-vitest skips auto-provisioning them as soon as this
// file calls setProjectAnnotations itself ("Found a setup file with
// setProjectAnnotations. Skipping automatic provisioning of preview
// annotations"). So without the import below, `parameters.a11y` is inert: you
// can set `test: 'error'` and the suite stays green on markup axe rejects
// (#1638).
//
// More info at: https://storybook.js.org/docs/api/portable-stories/portable-stories-vitest#setprojectannotations
setProjectAnnotations([a11yAddonAnnotations, projectAnnotations]);

// Every theme-dependent assertion keys off the `dark` class the decorator sets
// from matchMedia. If the provider stopped applying the project's colorScheme,
// `storybook-dark` would silently become a second light run (#2248).
beforeAll(() => {
  const want = (inject as (k: string) => string)("colorScheme");
  const got = matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
  if (got !== want)
    throw new Error(`project wants ${want} but the browser runs ${got}`);
});
