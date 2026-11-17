import { test, expect, ALICE, TEST_NEO4J_BOLT_URL, uid } from "./fixtures";
import { AuthPage } from "./pages/auth";

/**
 * Connections with the same settings share one server-side driver. Deleting
 * one of them must not close that driver under a query another user is still
 * running on theirs (#1823, fixed by #2177). Every row is created under a
 * unique name and deleted by id.
 */

test.describe("Connections with the same settings share a driver", () => {
  test.describe.configure({ timeout: 120_000 });

  test("deleting one user's connection does not break a query running on another's", async ({
    page,
    authPage,
    browser,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    const suffix = uid();
    const email = `shared-driver-${suffix}@example.com`;
    const password = "password123";
    const otherCtx = await browser.newContext();
    const other = await otherCtx.newPage();
    let userId: string | undefined;
    let aliceConnection: string | undefined;
    let otherConnection: string | undefined;

    const config = {
      uri: TEST_NEO4J_BOLT_URL,
      username: "neo4j",
      password: "neoboard123",
    };
    const connect = async (request: typeof page.request, name: string) => {
      const res = await request.post("/api/connections", {
        data: { name, type: "neo4j", config },
      });
      expect(res.status()).toBe(201);
      return (await res.json()).data.id as string;
    };

    try {
      const userRes = await page.request.post("/api/users", {
        data: {
          name: `Shared driver ${suffix}`,
          email,
          password,
          role: "creator",
        },
      });
      expect(userRes.status()).toBe(201);
      userId = (await userRes.json()).data.id;
      await new AuthPage(other).login(email, password);

      aliceConnection = await connect(page.request, `shared-a-${suffix}`);
      otherConnection = await connect(other.request, `shared-b-${suffix}`);

      // The other user's query is running when Alice deletes her connection.
      const running = other.request.post("/api/query", {
        data: {
          connectionId: otherConnection,
          query: "UNWIND range(1, 80000000) AS x RETURN count(x) AS answer",
        },
        timeout: 60_000,
      });
      await page.waitForTimeout(1000);
      const del = await page.request.delete(
        `/api/connections/${aliceConnection}`,
      );
      expect(del.ok()).toBeTruthy();
      aliceConnection = undefined;

      const res = await running;
      expect(res.status()).toBe(200);
      expect((await res.json()).data.data).toEqual([
        expect.objectContaining({ answer: 80000000 }),
      ]);

      // And the surviving connection still loads data afterwards.
      const after = await other.request.post("/api/query", {
        data: { connectionId: otherConnection, query: "RETURN 7 AS n" },
      });
      expect(after.status()).toBe(200);
      expect((await after.json()).data.data).toEqual([{ n: 7 }]);
    } finally {
      if (aliceConnection)
        await page.request.delete(`/api/connections/${aliceConnection}`);
      if (otherConnection)
        await other.request.delete(`/api/connections/${otherConnection}`);
      if (userId) await page.request.delete(`/api/users/${userId}`);
      await otherCtx.close();
    }
  });
});
