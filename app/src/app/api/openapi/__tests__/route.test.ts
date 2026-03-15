import { describe, it, expect } from "vitest";
import { GET } from "../route";

describe("GET /api/openapi", () => {
  it("returns 200 with valid OpenAPI 3.0 spec", async () => {
    const res = await GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.openapi).toBe("3.0.3");
    expect(body.info.title).toBe("NeoBoard Management API");
  });

  it("includes all resource paths", async () => {
    const res = await GET();
    const body = await res.json();
    const paths = Object.keys(body.paths);

    expect(paths).toContain("/api/users");
    expect(paths).toContain("/api/users/{id}");
    expect(paths).toContain("/api/connections");
    expect(paths).toContain("/api/connections/{id}");
    expect(paths).toContain("/api/dashboards");
    expect(paths).toContain("/api/dashboards/{id}");
    expect(paths).toContain("/api/widget-templates");
    expect(paths).toContain("/api/widget-templates/{id}");
    expect(paths).toContain("/api/query");
    expect(paths).toContain("/api/query/write");
    expect(paths).toContain("/api/auth/bootstrap-status");
  });

  it("documents all HTTP methods for user routes", async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.paths["/api/users"]).toHaveProperty("get");
    expect(body.paths["/api/users"]).toHaveProperty("post");
    expect(body.paths["/api/users/{id}"]).toHaveProperty("get");
    expect(body.paths["/api/users/{id}"]).toHaveProperty("patch");
    expect(body.paths["/api/users/{id}"]).toHaveProperty("delete");
  });

  it("includes security scheme", async () => {
    const res = await GET();
    const body = await res.json();

    expect(body.components.securitySchemes.bearerAuth).toBeDefined();
    expect(body.components.securitySchemes.bearerAuth.type).toBe("http");
    expect(body.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("sets Cache-Control header", async () => {
    const res = await GET();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=3600");
  });
});
