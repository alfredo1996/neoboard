import { test, expect, ALICE } from "./fixtures";

test.describe("API docs — /api/docs and /api/openapi.json", () => {
  test("GET /api/openapi.json returns valid OpenAPI spec", async ({ request }) => {
    const res = await request.get("/api/openapi.json");
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.openapi).toMatch(/^3\.0\./);
    expect(body.info.title).toBeTruthy();
    expect(body.paths).toHaveProperty("/api/connections");
    expect(body.paths).toHaveProperty("/api/dashboards");
    expect(body.paths).toHaveProperty("/api/query");
    expect(body.paths).toHaveProperty("/api/keys");
    expect(body.components.securitySchemes).toHaveProperty("BearerAuth");
  });

  test("GET /api/openapi.json sets CORS header", async ({ request }) => {
    const res = await request.get("/api/openapi.json");
    expect(res.headers()["access-control-allow-origin"]).toBe("*");
  });

  test("GET /api/docs returns Swagger UI HTML page", async ({ request }) => {
    const res = await request.get("/api/docs");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toMatch(/text\/html/);

    const body = await res.text();
    expect(body).toContain("swagger-ui");
    expect(body).toContain("/api/openapi.json");
    expect(body).toContain("NeoBoard");
  });

  test("/api/docs page renders Swagger UI in browser", async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/api/docs");

    // Swagger UI injects this class once it mounts (use first() — Swagger renders 2 elements with this class)
    await expect(page.locator(".swagger-ui").first()).toBeVisible({ timeout: 15_000 });

    // The spec title should appear in the rendered UI
    await expect(page.getByRole("heading", { name: "NeoBoard API" })).toBeVisible({ timeout: 15_000 });
  });

  test("/api/docs shows all resource sections", async ({ authPage, page }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await page.goto("/api/docs");

    await expect(page.locator(".swagger-ui").first()).toBeVisible({ timeout: 15_000 });

    // Each tag should render as a section header link (Swagger UI renders tags as <a> links)
    await expect(page.getByRole("link", { name: "Connections", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dashboards", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Query", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Users", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "API Keys", exact: true })).toBeVisible();
  });
});
