import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
  const pages = source.getPages();

  const lines = [
    "# NeoBoard Documentation",
    "",
    "> Open-source dashboarding for hybrid database architectures (Neo4j + PostgreSQL).",
    "",
    ...pages.map((page) => {
      const title = page.data.title ?? "Untitled";
      const desc = page.data.description ?? "";
      const url = page.url ?? "/";
      return desc ? `- [${title}](${url}): ${desc}` : `- [${title}](${url})`;
    }),
  ];

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
