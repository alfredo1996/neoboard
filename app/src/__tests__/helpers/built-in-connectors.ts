import { readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../../connection/src",
);

/**
 * The built-in connectors' types: each described in
 * `connection/src/<dir>/descriptor.ts`, read the way the CLI's `plugin list`
 * and check-boundaries.sh read them. Anything else registered was installed
 * from neoboard-connectors.json, after app/ was written (#2063).
 */
const BUILT_IN_TYPES = new Set(
  readdirSync(SRC, { recursive: true, encoding: "utf8" })
    .filter((f) => basename(f) === "descriptor.ts")
    .map((f) => {
      const type = /^ {2}type: "([^"]+)"/m.exec(
        readFileSync(join(SRC, f), "utf8"),
      )?.[1];
      if (!type) throw new Error(`${f}: no \`type: "…"\` to read`);
      return type;
    }),
);

export const isBuiltIn = (c: { type: string }) => BUILT_IN_TYPES.has(c.type);
