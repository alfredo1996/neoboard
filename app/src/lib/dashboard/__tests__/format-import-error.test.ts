import { describe, it, expect } from "vitest";
import { z } from "zod";
import { formatImportError, formatZodPath } from "../format-import-error";

describe("formatZodPath (#1048)", () => {
  it("formats object + array path segments", () => {
    expect(formatZodPath(["layout", "pages", 0, "widgets", 0, "query"])).toBe(
      "layout.pages[0].widgets[0].query",
    );
  });

  it("handles a root-level path", () => {
    expect(formatZodPath([])).toBe("");
  });
});

describe("formatImportError (#1048)", () => {
  const schema = z.object({
    dashboard: z.object({ name: z.string().min(1) }),
    layout: z.object({ version: z.literal(2) }),
  });

  it("names the missing/invalid field instead of a bare 'Required'", () => {
    // dashboard present but name missing → issue path is dashboard.name
    const result = schema.safeParse({
      dashboard: {},
      layout: { version: 2 },
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const msg = formatImportError(result.error);
      expect(msg).toMatch(/dashboard\.name/);
      expect(msg).toMatch(/Invalid dashboard file/);
    }
  });

  it("points at a nested wrong literal", () => {
    const result = schema.safeParse({
      dashboard: { name: "x" },
      layout: { version: 1 },
    });
    if (!result.success) {
      expect(formatImportError(result.error)).toMatch(/layout\.version/);
    }
  });
});
