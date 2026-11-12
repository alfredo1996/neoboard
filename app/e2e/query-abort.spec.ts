import { test, expect, ALICE } from "./fixtures";

// #2444: six slow reads abandoned by the browser used to hold the user's five
// running slots and the queue for their whole run, so the next fast read on the
// connection waited the 15 s queue timeout and answered 408. Now the server
// cancels them on the database and the fast read answers at once.
test.describe("Abandoned queries", () => {
  test.beforeEach(async ({ authPage }) => {
    await authPage.login(ALICE.email, ALICE.password);
  });

  test("the next fast read on the connection answers 200 within 2 s", async ({
    page,
  }) => {
    test.setTimeout(60_000);
    const outcome = await page.evaluate(async () => {
      const send = (query: string, signal?: AbortSignal) =>
        fetch("/api/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ connectionId: "conn-pg-001", query }),
          signal,
        });
      const controller = new AbortController();
      // Distinct text: identical queries are not de-duplicated server side, but
      // this keeps them apart in pg_stat_activity too.
      const slow = Array.from({ length: 6 }, (_, i) =>
        send(`SELECT pg_sleep(20), ${i} AS n`, controller.signal).catch(
          () => null,
        ),
      );
      await new Promise((r) => setTimeout(r, 1000));
      controller.abort();
      await Promise.all(slow);

      const startedAt = performance.now();
      const res = await send("SELECT 2 AS n");
      return {
        status: res.status,
        ms: Math.round(performance.now() - startedAt),
      };
    });

    expect(outcome.status).toBe(200);
    expect(outcome.ms).toBeLessThan(2000);
  });
});
