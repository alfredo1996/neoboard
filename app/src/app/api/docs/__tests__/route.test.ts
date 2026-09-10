import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/docs", () => {
  it("returns 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns HTML content-type", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
  });

  it("includes Swagger UI CDN reference", async () => {
    const res = await GET();
    const body = await res.text();
    expect(body).toContain("swagger-ui");
  });

  it("references the openapi.json spec", async () => {
    const res = await GET();
    const body = await res.text();
    expect(body).toContain("/api/openapi.json");
  });

  it("includes a page title", async () => {
    const res = await GET();
    const body = await res.text();
    expect(body).toContain("<title>");
    expect(body).toContain("NeoBoard");
  });

  // #1721: an altered CDN response must not run on the NeoBoard origin. The
  // hashes are sha384 of the exact pinned swagger-ui-dist@5.18.2 files, checked
  // in here on purpose, so a changed hash in route.ts fails this test.
  it.each([
    [
      "link",
      "swagger-ui.css",
      "sha384-rcbEi6xgdPk0iWkAQzT2F3FeBJXdG+ydrawGlfHAFIZG7wU6aKbQaRewysYpmrlW",
    ],
    [
      "script",
      "swagger-ui-bundle.js",
      "sha384-NXtFPpN61oWCuN4D42K6Zd5Rt2+uxeIT36R7kpXBuY9tLnZorzrJ4ykpqwJfgjpZ",
    ],
    [
      "script",
      "swagger-ui-standalone-preset.js",
      "sha384-qr68CD0cvHa88PmVu7e1a58Ego4qvKtcvcLdS2a8Mo5zILI01gyIV9jVwJk7X2NU",
    ],
  ])(
    "pins <%s> %s with integrity and crossorigin",
    async (tag, file, hash) => {
      const body = await (await GET()).text();
      const tags = body.match(new RegExp(`<${tag}\\b[^>]*>`, "g")) ?? [];
      const url = `https://unpkg.com/swagger-ui-dist@5.18.2/${file}"`;
      const matching = tags.filter((t) => t.includes(url));
      expect(matching).toHaveLength(1);
      expect(matching[0]).toContain(`integrity="${hash}"`);
      expect(matching[0]).toContain('crossorigin="anonymous"');
    },
  );

  it("loads no external asset without an integrity attribute", async () => {
    const body = await (await GET()).text();
    const external = body.match(/<(?:script|link)\b[^>]*https?:\/\/[^>]*>/g) ?? [];
    expect(external).toHaveLength(3);
    for (const t of external) expect(t).toMatch(/integrity="sha384-/);
  });
});
