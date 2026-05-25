import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "NeoBoard",
      description:
        "Open-source dashboarding for Neo4j & PostgreSQL",
      social: {
        github: "https://github.com/alfredo1996/neoboard",
      },
      sidebar: [
        {
          label: "Getting Started",
          autogenerate: { directory: "getting-started" },
        },
        {
          label: "CLI",
          autogenerate: { directory: "cli" },
        },
        {
          label: "User Guides",
          autogenerate: { directory: "guides" },
        },
        {
          label: "Chart Types",
          autogenerate: { directory: "charts" },
        },
        {
          label: "Concepts",
          autogenerate: { directory: "concepts" },
        },
        {
          label: "Administration",
          autogenerate: { directory: "administration" },
        },
        {
          label: "Developer Guide",
          autogenerate: { directory: "developer" },
        },
      ],
    }),
  ],
});
