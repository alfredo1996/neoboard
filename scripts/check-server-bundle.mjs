// NVL (WebGL, mobx) is browser-only. A server bundle that evaluates it is a
// 2 MB library run on every cold start, and each route bundle that evaluates
// mobx is one more instance and one more warning (#2059). This reads the
// build, so it catches any import path, not only the one shape a source scan
// knows. Usage: node scripts/check-server-bundle.mjs [nextDir=app/.next]
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Strings the libraries carry at runtime, which survive minification: mobx's
// own duplicate-instance warning, and the test id NVL gives its WebGL canvas.
export const MARKERS = ["multiple mobx instances", "nvl-gl-canvas"];

/** Every `.js` under `dir`. Source maps quote source comments, so they are skipped. */
const jsFiles = (dir) =>
  readdirSync(dir, { recursive: true })
    .filter((f) => f.endsWith(".js"))
    .map((f) => join(dir, f));

/** What is wrong with a Next build directory; empty when the server is clean. */
export function checkServerBundle(nextDir) {
  const server = jsFiles(join(nextDir, "server")).map((f) => [
    f,
    readFileSync(f, "utf8"),
  ]);
  const browser = jsFiles(join(nextDir, "static")).map((f) =>
    readFileSync(f, "utf8"),
  );
  return MARKERS.flatMap((m) => [
    // The browser's lazy graph chunk must still carry each marker; one that
    // a library upgrade dropped would make the server check pass vacuously.
    ...(browser.some((t) => t.includes(m))
      ? []
      : [
          `"${m}" is in no browser chunk, so it no longer identifies its library`,
        ]),
    ...server
      .filter(([, t]) => t.includes(m))
      .map(([f]) => `${f} holds "${m}"`),
  ]);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const problems = checkServerBundle(process.argv[2] ?? "app/.next");
  for (const p of problems) console.error(p);
  process.exit(problems.length > 0 ? 1 : 0);
}
