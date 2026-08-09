import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";
import { defineCollection } from "astro:content";

/**
 * The `loader` is required from Astro 5 onward (#1461). Without it the `docs`
 * collection resolves empty and `astro build` still **exits 0** — it just emits
 * a single 404 page and warns "The collection "docs" does not exist or is
 * empty" in passing. A green build is not evidence the site has any content;
 * check the page count.
 */
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
