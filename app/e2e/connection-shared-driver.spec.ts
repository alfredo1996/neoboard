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
      const rows = 80_000_000;
      // The suffix makes this run's transaction the only one the poll can
      // match, however many copies of this spec run against the same Neo4j.
      const answerKey = `answer_${suffix.replace(/\W/g, "_")}`;
      const bQuery = `UNWIND range(1, ${rows}) AS x RETURN count(x) AS ${answerKey}`;
      const running_n = async (request: typeof page.request, id: string) => {
        const r = await request.post("/api/query", {
          data: {
            connectionId: id,
            query: `SHOW TRANSACTIONS YIELD currentQuery WHERE currentQuery = '${bQuery}' RETURN count(*) AS n`,
          },
        });
        return (await r.json()).data?.data?.[0]?.n;
      };
      let queryDoneAt = 0;
      const running = other.request
        .post("/api/query", {
          data: {
            connectionId: otherConnection,
            query: bQuery,
          },
          timeout: 60_000,
        })
        .then((r) => {
          queryDoneAt = performance.now();
          return r;
        });

      // Delete only once the server reports the query running, so the test
      // cannot pass because the delete landed before it.
      await expect
        .poll(() => running_n(page.request, aliceConnection!), {
          timeout: 10_000,
          intervals: [50],
        })
        .toBe(1);

      const del = await page.request.delete(
        `/api/connections/${aliceConnection}`,
      );
      const deleteDoneAt = performance.now();
      expect(del.ok()).toBeTruthy();
      aliceConnection = undefined;

      // The database still lists the query, seen through the surviving
      // connection, so it ran on the shared driver after the delete returned.
      expect(await running_n(other.request, otherConnection)).toBe(1);

      const res = await running;
      expect(deleteDoneAt).toBeLessThan(queryDoneAt);
      expect(res.status()).toBe(200);
      expect((await res.json()).data.data).toEqual([{ [answerKey]: rows }]);

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
