import { source } from "@/lib/source";

export const revalidate = false;

export function GET() {
  const pages = source.getPages();

  const sections = pages.map((page) => {
    return [
      `# ${page.data.title ?? "Untitled"}`,
      page.data.description ? `\n${page.data.description}` : "",
      `\nURL: ${page.url ?? "/"}`,
    ].join("\n");
  });

  return new Response(sections.join("\n\n---\n\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
