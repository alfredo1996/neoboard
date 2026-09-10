// Prefixes Astro's `base` onto root-absolute links written in page content (#1318).
//
// Astro applies `base` to what it generates (sidebar, assets, search) but not
// to links authored in Markdown or MDX, and every content link here is
// root-absolute (/start-here/install/). On a GitHub Pages project site, served
// under /<repo>/, each of those would 404. This rewrites `href`/`src` on HTML
// elements and `href` on MDX components (LinkCard) at build time, so the
// sources stay host-neutral and the docs-accuracy slug checks keep reading them.
//
// Not covered: raw HTML in .md files and frontmatter links (hero actions).
// scripts/check-docs-dist.mjs reads the built site and fails CI on any miss.

export default function rehypeBaseLinks({ base } = {}) {
  const prefix = (base ?? "").replace(/\/+$/, "");
  const fix = (value) =>
    typeof value === "string" && value.startsWith("/") && !value.startsWith("//")
      ? prefix + value
      : value;
  const walk = (node) => {
    for (const key of ["href", "src"])
      if (node.properties?.[key]) node.properties[key] = fix(node.properties[key]);
    for (const attr of node.attributes ?? [])
      if (attr.name === "href") attr.value = fix(attr.value);
    node.children?.forEach(walk);
  };
  return prefix ? walk : () => {};
}
