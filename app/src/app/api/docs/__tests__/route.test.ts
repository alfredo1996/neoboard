import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/docs", () => {
  it("returns 200 with text/html content type", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/html");
  });

  it("returns HTML that references swagger-ui", async () => {
    const res = await GET();
    const html = await res.text();

    expect(html).toContain("swagger-ui");
    expect(html).toContain("/api/openapi");
    expect(html).toContain("NeoBoard API Documentation");
  });

  it("sets Cache-Control header", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});
