import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/openapi.json", () => {
  it("returns 200", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
  });

  it("returns JSON with OpenAPI 3.0 version", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.openapi).toMatch(/^3\.0\./);
  });

  it("has info block with title and version", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.info).toMatchObject({
      title: expect.any(String),
      version: expect.any(String),
    });
  });

  it("has paths block covering key resources", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.paths).toHaveProperty("/api/connections");
    expect(body.paths).toHaveProperty("/api/dashboards");
    expect(body.paths).toHaveProperty("/api/query");
    expect(body.paths).toHaveProperty("/api/users");
  });

  it("has BearerAuth security scheme", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.components.securitySchemes).toHaveProperty("BearerAuth");
    expect(body.components.securitySchemes.BearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
  });

  it("has CookieAuth security scheme", async () => {
    const res = await GET();
    const body = await res.json();
    expect(body.components.securitySchemes).toHaveProperty("CookieAuth");
  });

  it("sets correct content-type header", async () => {
    const res = await GET();
    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("sets CORS header for public spec access", async () => {
    const res = await GET();
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});
