import { describe, it, expect, vi, beforeEach } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

// #2534: a caller that needs only which connections the session can use must
// not pull their stored, encrypted configs into memory.
const selected: Array<Record<string, unknown> | undefined> = [];
const wheres: unknown[] = [];
vi.mock("@/lib/db", () => ({
  db: {
    select: (fields?: Record<string, unknown>) => {
      selected.push(fields);
      return {
        from: () => ({
          where: (w: unknown) => {
            wheres.push(w);
            return Promise.resolve([{ id: "c1", name: "n" }]);
          },
        }),
      };
    },
  },
}));

const session = { userId: "u1", role: "creator", tenantId: "t1" } as const;

describe("which connections a session can use", () => {
  beforeEach(() => {
    selected.length = 0;
    wheres.length = 0;
    vi.resetModules();
  });

  it("reads no config when only ids and names are wanted", async () => {
    const { usableConnectionNames } = await import("../concepts");
    expect(await usableConnectionNames(session)).toEqual([
      { id: "c1", name: "n" },
    ]);
    expect(Object.keys(selected[0] ?? {}).sort()).toEqual(["id", "name"]);
  });

  // Which rows come back is the WHERE, so pin it: tenant, then own or shared
  // for a creator, tenant only for an admin; the same as usableConnections.
  it.each([
    ["creator", ["t1", "u1", "shared"], true],
    ["admin", ["t1"], false],
  ] as const)(
    "filters by tenant and by who may use it, for a %s, as usableConnections does",
    async (role, params, owned) => {
      const { usableConnections, usableConnectionNames } =
        await import("../concepts");
      const s = { userId: "u1", role, tenantId: "t1" } as const;
      await usableConnectionNames(s);
      await usableConnections(s);
      const [names, full] = wheres.map((w) =>
        new PgDialect().sqlToQuery(w as never),
      );
      expect(names).toEqual(full);
      expect(names.params).toEqual(params);
      expect(names.sql).toContain("tenant_id");
      expect(names.sql.includes("userId")).toBe(owned);
    },
  );
});
