import { test, expect, ALICE, createTestDashboard, uid } from "./fixtures";

/**
 * Two concurrent shares of one dashboard with one user leave one share (#2259).
 * Runs against the real database: a mock adapter accepts what the unique key
 * refuses. Rows are created under a unique name and deleted by id.
 */
test.describe("Sharing a dashboard twice at once", () => {
  test("leaves one share, holding the last role written", async ({
    page,
    authPage,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = uid();
    const email = `share-race-${suffix}@example.com`;
    let userId = "";
    let dashboardId = "";
    try {
      ({ id: dashboardId } = await createTestDashboard(
        page.request,
        `share-race-${suffix}`,
      ));
      const user = await page.request.post("/api/users", {
        data: {
          name: `Share race ${suffix}`,
          email,
          password: "password123",
          role: "creator",
          canWrite: true,
        },
      });
      expect(user.status()).toBe(201);
      userId = (await user.json()).data.id as string;

      const url = `/api/dashboards/${dashboardId}/share`;
      const burst = await Promise.all(
        Array.from({ length: 8 }, () =>
          page.request.post(url, { data: { email, role: "viewer" } }),
        ),
      );
      expect(burst.map((r) => r.status())).toEqual(Array(8).fill(201));
      expect((await (await page.request.get(url)).json()).data).toHaveLength(1);

      const again = await page.request.post(url, {
        data: { email, role: "editor" },
      });
      expect(again.status()).toBe(201);
      const shares = (await (await page.request.get(url)).json()).data;
      expect(shares).toHaveLength(1);
      expect(shares[0].role).toBe("editor");
    } finally {
      if (dashboardId)
        await page.request.delete(`/api/dashboards/${dashboardId}`);
      if (userId) await page.request.delete(`/api/users/${userId}`);
    }
  });
});
