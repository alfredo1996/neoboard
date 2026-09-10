import { test, expect, ALICE } from "./fixtures";

/**
 * MCP endpoint (#1694), end to end: an API key created through the app drives
 * initialize → tools/list → tools/call run_query against the real server and
 * the testcontainer Neo4j.
 *
 * `request` shares no cookies with `page`, so the key alone authenticates
 * every MCP call — exactly what an external MCP client does.
 */

const NEO4J_CONNECTION_ID = "conn-neo4j-001";

test.describe("MCP endpoint", () => {
  test("an API key lists the tools and runs read-only queries through /api/mcp", async ({
    authPage,
    sidebarPage,
    page,
    request,
  }) => {
    await authPage.login(ALICE.email, ALICE.password);
    await sidebarPage.navigateTo("Settings");
    await page.getByRole("button", { name: "API Keys" }).click();
    await page.getByRole("button", { name: "Create API Key" }).first().click();

    const dialog = page.getByRole("dialog");
    await dialog.locator("#key-name").fill(`MCP E2E ${Date.now()}`);
    await dialog.getByRole("button", { name: "Generate Key" }).click();
    await expect(
      dialog.getByRole("heading", { name: "API Key Created" }),
    ).toBeVisible({ timeout: 10_000 });
    const key = await dialog
      .getByTestId("api-key-display")
      .locator("span")
      .first()
      .textContent();
    expect(key).toMatch(/^nb_[0-9a-f]{64}$/);
    await dialog.getByRole("button", { name: "Done" }).click();

    const headers = {
      Authorization: `Bearer ${key}`,
      Accept: "application/json, text/event-stream",
    };
    let nextId = 1;
    const rpc = (method: string, params?: Record<string, unknown>) =>
      request.post("/api/mcp", {
        headers,
        data: {
          jsonrpc: "2.0",
          id: nextId++,
          method,
          ...(params ? { params } : {}),
        },
      });
    const runQuery = async (query: string) => {
      const res = await rpc("tools/call", {
        name: "run_query",
        arguments: { connectionId: NEO4J_CONNECTION_ID, query },
      });
      expect(res.status()).toBe(200);
      return (await res.json()).result as {
        isError?: boolean;
        content: { type: string; text: string }[];
      };
    };

    await test.step("initialize negotiates the client's protocol version", async () => {
      const res = await rpc("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "neoboard-e2e", version: "1.0.0" },
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).result).toMatchObject({
        protocolVersion: "2025-06-18",
        capabilities: { tools: {} },
        serverInfo: { name: "neoboard" },
      });

      const initialized = await request.post("/api/mcp", {
        headers: { ...headers, "MCP-Protocol-Version": "2025-06-18" },
        data: { jsonrpc: "2.0", method: "notifications/initialized" },
      });
      expect(initialized.status()).toBe(202);
    });

    await test.step("tools/list offers the five read tools", async () => {
      const res = await rpc("tools/list");
      const names = (await res.json()).result.tools.map(
        (t: { name: string }) => t.name,
      );
      expect(names.sort()).toEqual([
        "get_schema",
        "list_connections",
        "list_dashboards",
        "ping",
        "run_query",
      ]);
    });

    await test.step("run_query returns rows from Neo4j", async () => {
      const result = await runQuery("UNWIND range(1, 3) AS n RETURN n");
      expect(result.isError).toBeUndefined();
      const payload = JSON.parse(result.content[0].text);
      expect(payload.data).toHaveLength(3);
      expect(payload.rowLimit).toBe(5000);
      expect(payload.truncated).toBeUndefined();
    });

    await test.step("run_query stops at the connection's row limit", async () => {
      const result = await runQuery("UNWIND range(1, 5001) AS n RETURN n");
      const payload = JSON.parse(result.content[0].text);
      expect(payload.data).toHaveLength(5000);
      expect(payload.truncated).toBe(true);
    });

    await test.step("run_query refuses a write", async () => {
      const result = await runQuery("CREATE (:McpE2eWriteProbe) RETURN 1");
      expect(result.isError).toBe(true);
    });

    await test.step("the endpoint refuses what it must", async () => {
      const ping = { jsonrpc: "2.0", id: 99, method: "ping" };
      expect((await request.post("/api/mcp", { data: ping })).status()).toBe(
        401,
      );
      expect(
        (
          await request.post("/api/mcp", {
            headers: { Authorization: `Bearer nb_${"0".repeat(64)}` },
            data: ping,
          })
        ).status(),
      ).toBe(401);
      expect(
        (
          await request.post("/api/mcp", {
            headers: { ...headers, Origin: "https://evil.example" },
            data: ping,
          })
        ).status(),
      ).toBe(403);
      expect((await request.get("/api/mcp", { headers })).status()).toBe(405);
      expect((await request.delete("/api/mcp", { headers })).status()).toBe(
        405,
      );
    });
  });
});
