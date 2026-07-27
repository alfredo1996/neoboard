import { test, expect, ALICE } from "./fixtures";

/**
 * End-to-end proof that the audit trail records real activity (#1234).
 *
 * The route unit tests assert each mutation calls `auditRequest` with the
 * right shape; they cannot prove the write reaches the table, because
 * `auditLog` is fire-and-forget and mocked there. This spec closes that gap:
 * perform a mutation, then read it back through the listing endpoint.
 *
 * Credential-denylist coverage stays in the route unit tests — asserting it
 * here would mean creating real connections, which other specs count.
 */
test.describe("Audit trail", () => {
  test("a dashboard mutation shows up in /api/audit-logs (#1234)", async ({
    authPage,
    page,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);

    const name = `Audited Dashboard ${Date.now()}`;
    const created = await page.request.post("/api/dashboards", {
      data: { name },
    });
    expect(created.ok()).toBe(true);
    const { data: dashboard } = await created.json();

    // The writer is fire-and-forget, so the row can land just after the
    // response returns. Poll rather than sleep on a fixed delay.
    await expect
      .poll(
        async () => {
          const res = await page.request.get(
            "/api/audit-logs?action=dashboard.create&limit=100",
          );
          if (!res.ok()) return [];
          const { data } = await res.json();
          return data.map((l: { resourceId?: string }) => l.resourceId);
        },
        { timeout: 10_000 },
      )
      .toContain(dashboard.id);

    // The entry identifies who did it — an audit row without an actor is
    // no more useful than no row at all.
    const res = await page.request.get(
      "/api/audit-logs?action=dashboard.create&limit=100",
    );
    const { data } = await res.json();
    const entry = data.find(
      (l: { resourceId?: string }) => l.resourceId === dashboard.id,
    );
    expect(entry.userId).toBe("user-alice-001");
    expect(entry.tenantId).toBe("default");
  });
});
