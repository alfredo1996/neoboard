import { setProjectAnnotations } from "@storybook/react-vite";
import * as a11yAddonAnnotations from "@storybook/addon-a11y/preview";
import * as projectAnnotations from "./preview";

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
