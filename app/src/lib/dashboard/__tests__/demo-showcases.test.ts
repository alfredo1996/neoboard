import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { neoboardExportSchema } from "../dashboard-import";

const __dirname = dirname(fileURLToPath(import.meta.url));
const demoDir = join(
  __dirname,
  "..",
  "..",
  "..",
  "..",
  "..",
  "scripts",
  "demo",
);

const showcases = [
  { key: "chart-gallery", file: "chart-gallery.json" },
  { key: "click-actions", file: "click-actions.json" },
  { key: "transformations", file: "transformations.json" },
  { key: "rule-based-styling", file: "rule-based-styling.json" },
];

describe("demo showcase JSON files", () => {
  for (const { key, file } of showcases) {
    describe(key, () => {
      const path = join(demoDir, file);
      const raw = readFileSync(path, "utf-8");
      const parsed = JSON.parse(raw);

      it("validates against neoboardExportSchema", () => {
        const result = neoboardExportSchema.safeParse(parsed);
        if (!result.success) {
          throw new Error(
            `${file} failed validation:\n${JSON.stringify(result.error.issues, null, 2)}`,
          );
        }
        expect(result.success).toBe(true);
      });

      it("has formatVersion 1 and layout version 2", () => {
        expect(parsed.formatVersion).toBe(1);
        expect(parsed.layout.version).toBe(2);
      });

      it("uses only portable connection keys (conn_*) in widgets", () => {
        const connKeys = Object.keys(parsed.connections);
        for (const connKey of connKeys) {
          expect(connKey).toMatch(/^conn_/);
        }
        for (const page of parsed.layout.pages) {
          for (const widget of page.widgets ?? []) {
            if (widget.connectionId) {
              expect(connKeys).toContain(widget.connectionId);
            }
          }
        }
      });
    });
  }
});
