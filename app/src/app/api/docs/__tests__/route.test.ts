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
});
