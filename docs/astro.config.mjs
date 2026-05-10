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
          label: "Authentication",
          autogenerate: { directory: "authentication" },
        },
        {
          label: "Dashboards",
          autogenerate: { directory: "dashboards" },
        },
        {
          label: "Connections",
          autogenerate: { directory: "connections" },
        },
        {
          label: "Chart Types",
          autogenerate: { directory: "charts" },
        },
        {
          label: "Administration",
          autogenerate: { directory: "administration" },
        },
        {
          label: "CLI",
          autogenerate: { directory: "cli" },
        },
        {
          label: "Developer Guide",
          autogenerate: { directory: "developer" },
        },
      ],
    }),
  ],
});
