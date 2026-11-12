import { test, expect, ALICE } from "./fixtures";

/**
 * End-to-end proof that /api/metrics sees the queries the app runs (#2440).
 *
 * Unit tests cannot: in a production build the query route and the scrape
 * route are separate bundles, and a module-level registry would be two
 * registries (#1888). Run a real query, then scrape with the token.
 */
test.describe("Prometheus metrics", () => {
  test("a query shows up in the query-time histogram; a scrape needs the token (#2440)", async ({
    authPage,
    page,
  }) => {
    const token = process.env.METRICS_TOKEN;
    expect(token).toBeTruthy();
    await authPage.login(ALICE.email, ALICE.password);

    const list = await page.request.get("/api/connections");
    const { data: connections } = await list.json();
    const seeded = connections.find(
      (c: { name: string }) => c.name === "Movies DB (PostgreSQL)",
    );
    const run = await page.request.post("/api/query", {
      data: { connectionId: seeded.id, query: "SELECT 1 AS one" },
    });
    expect(run.status()).toBe(200);

    const refused = await page.request.get("/api/metrics");
    expect(refused.status()).toBe(401);

    const scrape = await page.request.get("/api/metrics", {
      headers: { authorization: `Bearer ${token}` },
    });
    expect(scrape.status()).toBe(200);
    const text = await scrape.text();
    const counts = [
      ...text.matchAll(/^neoboard_query_duration_seconds_count\{.*\} (\d+)$/gm),
    ].map((m) => Number(m[1]));
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(1);
  });
});
