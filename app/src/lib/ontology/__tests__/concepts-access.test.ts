import { describe, it, expect, vi, beforeEach } from "vitest";

// #2534: a caller that needs only which connections the session can use must
// not pull their stored, encrypted configs into memory.
const selected: Array<Record<string, unknown> | undefined> = [];
vi.mock("@/lib/db", () => ({
  db: {
    select: (fields?: Record<string, unknown>) => {
      selected.push(fields);
      return {
        from: () => ({
          where: () => Promise.resolve([{ id: "c1", name: "n" }]),
        }),
      };
    },
  },
}));

const session = { userId: "u1", role: "creator", tenantId: "t1" } as const;

describe("which connections a session can use", () => {
  beforeEach(() => {
    selected.length = 0;
    vi.resetModules();
  });

  it("reads no config when only ids and names are wanted", async () => {
    const { usableConnectionNames } = await import("../concepts");
    expect(await usableConnectionNames(session)).toEqual([
      { id: "c1", name: "n" },
    ]);
    expect(Object.keys(selected[0] ?? {}).sort()).toEqual(["id", "name"]);
  });

  it("still reads the config for a caller that decrypts it", async () => {
    const { usableConnections } = await import("../concepts");
    await usableConnections(session);
    expect(Object.keys(selected[0] ?? {})).toContain("configEncrypted");
  });
});
