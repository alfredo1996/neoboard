/**
 * #2514: the editor loads /schema and /ontology, and each Model page save
 * checks its keys again. One connection is read once between them; only
 * Refresh reads it again.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";

const CONN = { id: "c1", userId: "u1", type: "x", configEncrypted: "enc" };
const fetchSchema = vi.fn();

// Every select answers: the connection first, then no stored terms.
function selectChain() {
  const rows = (): unknown[] => [CONN];
  return {
    from: () => ({
      where: () =>
        Object.assign(Promise.resolve([]), {
          limit: () => Promise.resolve(rows()),
        }),
    }),
  };
}

vi.mock("@/lib/auth/session", () => ({
  requireSession: async () => ({
    userId: "u1",
    role: "creator",
    tenantId: "t1",
  }),
}));
const writes = {
  insert: () => ({
    values: () => ({ onConflictDoUpdate: () => Promise.resolve() }),
  }),
  delete: () => ({ where: () => Promise.resolve() }),
};
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(selectChain),
    ...writes,
    transaction: (fn: (tx: unknown) => unknown) => fn(writes),
  },
}));
vi.mock("@/lib/crypto/crypto", () => ({
  decryptJson: () => ({ uri: "x://host" }),
}));
vi.mock("@/lib/connector/container-host", () => ({
  driverConfig: async (c: unknown) => c,
}));
vi.mock("@/lib/connector/connection-adapter", () => ({
  getSchemaManager: () => ({ fetchSchema }),
  describeConnectionTerms: async (
    _t: string,
    _c: unknown,
    read: () => Promise<{ labels: string[] }>,
  ) =>
    (await read()).labels.map((key) => ({
      kind: "entity",
      key,
      parentKey: "",
    })),
}));
vi.mock("next/server", () => nextResponseMockFactory());

type Handler = (req: Request, ctx: unknown) => Promise<Response>;
const at = (query = "") => new Request(`http://localhost/x${query}`);

describe("one introspection between /schema and /ontology (#2514)", () => {
  let schemaGET: Handler;
  let ontologyGET: Handler;
  let ontologyPUT: Handler;

  beforeEach(async () => {
    vi.resetModules();
    fetchSchema.mockReset();
    fetchSchema.mockResolvedValue({ type: "x", labels: ["Person"] });
    schemaGET = (await import("../schema/route")).GET as Handler;
    const ontology = await import("../ontology/route");
    ontologyGET = ontology.GET as Handler;
    ontologyPUT = ontology.PUT as Handler;
    // Each test starts with an empty cache, whichever module copy holds it.
    (await import("@/lib/connector/schema-cache")).resetSchemaCacheForTests();
  });

  it("reads once for both routes and for a repeat", async () => {
    await schemaGET(at(), makeParams("c1"));
    const res = await ontologyGET(at(), makeParams("c1"));
    await ontologyGET(at(), makeParams("c1"));

    expect((await res.json()).data.terms).toHaveLength(1);
    expect(fetchSchema).toHaveBeenCalledTimes(1);
  });

  it("checks a save's keys against the read the page just made", async () => {
    await ontologyGET(at(), makeParams("c1"));
    const res = await ontologyPUT(
      new Request("http://localhost/x", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          terms: [
            { kind: "entity", key: "Person", parentKey: "", displayName: "P" },
          ],
        }),
      }),
      makeParams("c1"),
    );

    expect(res.status).toBe(200);
    expect(fetchSchema).toHaveBeenCalledTimes(1);
  });

  it("reads again on Refresh", async () => {
    await schemaGET(at(), makeParams("c1"));
    await ontologyGET(at("?refresh=1"), makeParams("c1"));

    expect(fetchSchema).toHaveBeenCalledTimes(2);
  });
});
