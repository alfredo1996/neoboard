import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams, makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import type { SchemaTerm } from "@neoboard/connection";
import {
  connections,
  ontologyConcepts,
  ontologyConceptSides,
} from "@/lib/db/schema";

// ---------------------------------------------------------------------------
// Mocks: a db whose tables hold what a test puts there, recording every
// predicate, insert and delete so tenant filters and writes can be asserted.
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();
const mockFetchTerms =
  vi.fn<
    (
      type: string,
      config?: unknown,
      scope?: { refresh?: boolean },
    ) => Promise<SchemaTerm[]>
  >();
const rows = new Map<unknown, unknown[]>();
const wheres: { table: unknown; where: unknown }[] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const deletes: { table: unknown; where: unknown }[] = [];
const updates: unknown[] = [];
const orderBys: unknown[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: (table: unknown) => ({
      where: (where: unknown) => {
        wheres.push({ table, where });
        const r = rows.get(table) ?? [];
        return Object.assign(Promise.resolve(r), {
          for: () => Promise.resolve(r),
          limit: () => Promise.resolve(r),
          orderBy: (o: unknown) => {
            orderBys.push(o);
            return Promise.resolve(r);
          },
        });
      },
    }),
  })),
  insert: vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      inserts.push({ table, values });
      return Promise.resolve();
    },
  })),
  update: vi.fn(() => ({
    set: (s: unknown) => ({
      where: () => {
        updates.push(s);
        return Promise.resolve();
      },
    }),
  })),
  delete: vi.fn((table: unknown) => ({
    where: (where: unknown) => {
      deletes.push({ table, where });
      return Promise.resolve();
    },
  })),
  transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockDb)),
};

class ForbiddenError extends Error {}
class UnauthorizedError extends Error {}

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: vi.fn(() => ({})) }));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  fetchConnectionTerms: mockFetchTerms,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  eq: (col: { name: string }, val: unknown) => ({ eq: [col.name, val] }),
  and: (...parts: unknown[]) => ({ and: parts }),
  or: (...parts: unknown[]) => ({ or: parts }),
  inArray: (col: { name: string }, vals: unknown[]) => ({
    inArray: [col.name, vals],
  }),
}));

const CREATOR = { userId: "u1", role: "creator", tenantId: "t1" };
const READER = { userId: "u2", role: "reader", tenantId: "t1" };
const ADMIN = { userId: "u3", role: "admin", tenantId: "t1" };

const conn = (id: string) => ({
  id,
  name: `Name ${id}`,
  type: `type-${id}`,
  configEncrypted: "enc",
});
const G = conn("graph");
const S = conn("sql");

// What each connection reports: type-graph holds Person.email, type-sql holds
// customers.email and orders.customer_id.
const prop = (entity: string, key: string): SchemaTerm => ({
  kind: "property",
  key,
  parentKey: `entity:${entity}`,
});
const ent = (key: string): SchemaTerm => ({
  kind: "entity",
  key,
  parentKey: "",
});
const TERMS: Record<string, SchemaTerm[]> = {
  "type-graph": [ent("Person"), prop("Person", "email")],
  "type-sql": [
    ent("customers"),
    prop("customers", "email"),
    ent("orders"),
    prop("orders", "customer_id"),
  ],
};

const side = (
  connectionId: string,
  entityKey: string,
  keyPropertyKey: string,
) => ({
  connectionId,
  entityKey,
  keyPropertyKey,
});
const storedSide = (
  conceptId: string,
  s: ReturnType<typeof side>,
  tenantId = "t1",
) => ({ id: `${conceptId}-${s.entityKey}`, tenantId, conceptId, ...s });
const CUSTOMER = {
  id: "k1",
  tenantId: "t1",
  name: "Customer",
  parameter: "customer",
  description: "A buyer",
};

type Handler = (req?: Request, ctx?: unknown) => Promise<Response>;
type IdHandler = (
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) => Promise<Response>;

const URL_ALL = "http://localhost/api/ontology/concepts";

describe("/api/ontology/concepts", () => {
  let GET: Handler;
  let POST: Handler;
  let PATCH: IdHandler;
  let DELETE: IdHandler;

  beforeEach(async () => {
    vi.clearAllMocks();
    rows.clear();
    wheres.length = 0;
    inserts.length = 0;
    deletes.length = 0;
    updates.length = 0;
    orderBys.length = 0;
    mockFetchTerms.mockImplementation(async (type) => TERMS[type] ?? []);
    mockRequireSession.mockResolvedValue(CREATOR);
    rows.set(connections, [G, S]);
    rows.set(ontologyConcepts, []);
    rows.set(ontologyConceptSides, []);
    const mod = await import("../route");
    GET = mod.GET as Handler;
    POST = mod.POST as Handler;
    const one = await import("../[id]/route");
    PATCH = one.PATCH as IdHandler;
    DELETE = one.DELETE as IdHandler;
  });

  const whereOf = (table: unknown) =>
    JSON.stringify(wheres.filter((w) => w.table === table).map((w) => w.where));
  const body = (over: object = {}) => ({
    name: "Customer",
    parameter: "customer",
    description: "A buyer",
    sides: [
      side("graph", "Person", "email"),
      side("sql", "customers", "email"),
    ],
    ...over,
  });
  const post = (b: object = body()) => POST(makeRequest(b));
  const patch = (b: object) => PATCH(makeRequest(b), makeParams("k1"));

  describe("GET", () => {
    it("lists a two-sided concept, every query filtered by the session's tenant", async () => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Person", "email")),
        storedSide("k1", side("sql", "customers", "email")),
      ]);
      const res = await GET(new Request(URL_ALL));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.concepts).toHaveLength(1);
      expect(data.concepts[0]).toMatchObject({
        name: "Customer",
        parameter: "customer",
        description: "A buyer",
      });
      expect(data.concepts[0].sides).toEqual([
        { ...side("graph", "Person", "email"), missing: null },
        { ...side("sql", "customers", "email"), missing: null },
      ]);
      for (const t of [ontologyConcepts, ontologyConceptSides, connections]) {
        expect(whereOf(t)).toContain('["tenant_id","t1"]');
      }
    });

    it("reads back two sides on one connection", async () => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("sql", "customers", "email")),
        storedSide("k1", side("sql", "orders", "customer_id")),
      ]);
      const { data } = await (await GET(new Request(URL_ALL))).json();
      expect(
        data.concepts[0].sides.map((s: { entityKey: string }) => s.entityKey),
      ).toEqual(["customers", "orders"]);
    });

    it("shows a creator only the sides on connections they can use, and hides a concept with none", async () => {
      // The connections table answers what the caller may use: only the graph.
      rows.set(connections, [G]);
      rows.set(ontologyConcepts, [
        CUSTOMER,
        { ...CUSTOMER, id: "k2", name: "Order", parameter: "order" },
      ]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Person", "email")),
        storedSide("k1", side("sql", "customers", "email")),
        storedSide("k2", side("sql", "orders", "customer_id")),
      ]);
      const { data } = await (await GET(new Request(URL_ALL))).json();
      expect(data.concepts).toHaveLength(1);
      expect(data.concepts[0].sides).toHaveLength(1);
      expect(data.concepts[0].sides[0].connectionId).toBe("graph");
      // The usable filter is owner-or-shared for a creator.
      expect(whereOf(connections)).toContain('["visibility","shared"]');
    });

    it("returns a creator the same keys whether or not a concept has a hidden side", async () => {
      rows.set(connections, [G]);
      rows.set(ontologyConcepts, [
        CUSTOMER,
        { ...CUSTOMER, id: "k2", name: "Order", parameter: "order" },
      ]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Person", "email")),
        storedSide("k1", side("sql", "customers", "email")),
        storedSide("k2", side("graph", "Order", "id")),
      ]);
      const { data } = await (await GET(new Request(URL_ALL))).json();
      expect(data.concepts).toHaveLength(2);
      const [hidden, whole] = data.concepts.map((c: object) =>
        Object.keys(c).sort(),
      );
      expect(hidden).toEqual(whole);
      expect(hidden).toEqual([
        "description",
        "id",
        "name",
        "parameter",
        "sides",
      ]);
    });

    it("reads the concepts in name order", async () => {
      await GET(new Request(URL_ALL));
      expect(orderBys).toEqual([ontologyConcepts.name]);
    });

    it("shows an admin every concept, even one with no side", async () => {
      mockRequireSession.mockResolvedValue(ADMIN);
      rows.set(ontologyConcepts, [CUSTOMER]);
      const { data } = await (await GET(new Request(URL_ALL))).json();
      expect(data.concepts).toHaveLength(1);
      expect(data.concepts[0].sides).toEqual([]);
      expect(whereOf(connections)).not.toContain('["visibility","shared"]');
    });

    it.each([
      ["the entity", side("sql", "gone", "email"), "entity"],
      ["the key property", side("sql", "customers", "gone"), "keyProperty"],
    ])(
      "flags a side whose %s left the database, and writes nothing",
      async (_w, s, missing) => {
        rows.set(ontologyConcepts, [CUSTOMER]);
        rows.set(ontologyConceptSides, [storedSide("k1", s)]);
        const { data } = await (await GET(new Request(URL_ALL))).json();
        expect(data.concepts[0].sides[0].missing).toBe(missing);
        expect(inserts).toEqual([]);
        expect(deletes).toEqual([]);
        expect(updates).toEqual([]);
      },
    );

    it("still returns concepts on healthy connections when one connection cannot be decrypted", async () => {
      const { decryptJson } = await import("@/lib/crypto/crypto");
      vi.mocked(decryptJson).mockImplementationOnce(() => {
        throw new Error("bad key");
      });
      mockRequireSession.mockResolvedValue(ADMIN);
      rows.set(connections, [G, S]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Person", "email")),
        storedSide("k1", side("sql", "customers", "email")),
      ]);
      const res = await GET(new Request(URL_ALL));
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(
        data.concepts[0].sides.map((x: { missing: unknown }) => x.missing),
      ).toEqual([null, null]);
    });

    it("with live=0 reads no connection's structure, flags nothing, and still hides what the caller cannot use", async () => {
      mockRequireSession.mockResolvedValue({ ...CREATOR, userId: "u9" });
      rows.set(connections, [G]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Gone", "email")),
        storedSide("k1", side("sql", "customers", "email")),
      ]);
      const res = await GET(
        new Request("http://localhost/api/ontology/concepts?live=0"),
      );
      const { data } = await res.json();
      expect(mockFetchTerms).not.toHaveBeenCalled();
      expect(data.concepts[0].sides).toEqual([
        { ...side("graph", "Gone", "email"), missing: null },
      ]);
    });

    it("reads the structure by default, so a gone entity is flagged", async () => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Gone", "email")),
      ]);
      const { data } = await (await GET(new Request(URL_ALL))).json();
      expect(data.concepts[0].sides[0].missing).toBe("entity");
    });

    it("does not flag a side when its connection describes no structure", async () => {
      mockFetchTerms.mockResolvedValue([]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("sql", "customers", "email")),
      ]);
      const { data } = await (await GET(new Request(URL_ALL))).json();
      expect(data.concepts[0].sides[0].missing).toBeNull();
    });
  });

  describe("POST", () => {
    it("is refused for a reader", async () => {
      mockRequireSession.mockResolvedValue(READER);
      expect((await post()).status).toBe(403);
      expect(inserts).toEqual([]);
    });

    it("saves a two-sided concept in the session's tenant, whatever the body says", async () => {
      const res = await post(body({ tenantId: "t2" }));
      expect(res.status).toBe(201);
      const concept = inserts.find((i) => i.table === ontologyConcepts)
        ?.values as Record<string, unknown>;
      expect(concept).toMatchObject({
        tenantId: "t1",
        name: "Customer",
        parameter: "customer",
      });
      const sides = inserts.find((i) => i.table === ontologyConceptSides)
        ?.values as Record<string, unknown>[];
      expect(sides).toHaveLength(2);
      expect(
        sides.every((s) => s.tenantId === "t1" && s.conceptId === concept.id),
      ).toBe(true);
    });

    it("saves two sides on one connection", async () => {
      rows.set(connections, [S]); // the mock does not apply the id filter
      const res = await post(
        body({
          sides: [
            side("sql", "customers", "email"),
            side("sql", "orders", "customer_id"),
          ],
        }),
      );
      expect(res.status).toBe(201);
      const sides = inserts.find((i) => i.table === ontologyConceptSides)
        ?.values as unknown[];
      expect(sides).toHaveLength(2);
    });

    it("refuses a side on a connection the caller cannot use", async () => {
      rows.set(connections, [G]); // the sql connection is not theirs
      const res = await post();
      expect(res.status).toBe(403);
      expect(inserts).toEqual([]);
    });

    it.each([
      ["entity", side("sql", "nope", "email")],
      ["key property", side("sql", "customers", "nope")],
    ])(
      "refuses a side whose %s the connection does not report",
      async (_w, s) => {
        rows.set(connections, [S]);
        const res = await post(body({ sides: [s] }));
        expect(res.status).toBe(400);
        expect(inserts).toEqual([]);
        expect(mockFetchTerms).toHaveBeenCalledTimes(2); // cached, then fresh
      },
    );

    it("reads past the cache once for an entity it does not know, and saves it when the database has it (#2514)", async () => {
      rows.set(connections, [S]);
      mockFetchTerms.mockImplementation(async (type, _c, scope) => {
        const live = TERMS[type] ?? [];
        return scope?.refresh
          ? [...live, ent("invoices"), prop("invoices", "number")]
          : live;
      });
      const res = await post(
        body({ sides: [side("sql", "invoices", "number")] }),
      );
      expect(res.status).toBe(201);
    });

    it("reads past the cache only the connection whose side it refused (#2534)", async () => {
      rows.set(connections, [G, S]);
      await post(
        body({
          sides: [side("graph", "Person", "email"), side("sql", "nope", "x")],
        }),
      );
      const fresh = mockFetchTerms.mock.calls.filter(
        ([, , scope]) => scope?.refresh,
      );
      expect(fresh.map(([type]) => type)).toEqual(["type-sql"]);
    });

    it("never waits on a second read when every side is known (#2514)", async () => {
      rows.set(connections, [S]);
      await post(body({ sides: [side("sql", "customers", "email")] }));
      expect(mockFetchTerms).toHaveBeenCalledTimes(1);
    });

    it.each([
      ["name", { name: "Customer", parameter: "other" }],
      ["parameter", { name: "Other", parameter: "customer" }],
    ])("refuses a duplicate %s, and says which", async (which, over) => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      const res = await post(body(over));
      expect(res.status).toBe(409);
      expect((await res.json()).error.message.toLowerCase()).toContain(which);
      expect(inserts).toEqual([]);
    });

    it("explains two identical sides in plain words", async () => {
      const dup = side("sql", "customers", "email");
      const res = await post(body({ sides: [dup, dup] }));
      expect((await res.json()).error.message).toContain(
        "Two sides are the same",
      );
    });

    it("does not name the concept that holds the parameter", async () => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      const res = await post(body({ name: "Other" }));
      expect((await res.json()).error.message).not.toContain("Customer");
    });

    it.each([
      ["POST", () => post()],
      ["PATCH", () => patch(body())],
    ])(
      "answers 409 when a concurrent %s hits a unique index",
      async (_m, run) => {
        if (_m === "PATCH") rows.set(ontologyConcepts, [CUSTOMER]);
        rows.set(ontologyConceptSides, [
          storedSide("k1", side("graph", "Person", "email")),
        ]);
        const sql = "Failed query: insert into ontology_concepts";
        mockDb.transaction.mockRejectedValueOnce(
          Object.assign(new Error(sql), { cause: { code: "23505" } }),
        );
        const res = await run();
        expect(res.status).toBe(409);
        expect(JSON.stringify(await res.json())).not.toContain("Failed query");
      },
    );

    it.each([
      ["POST", () => post()],
      ["PATCH", () => patch(body())],
    ])(
      "answers 409 when a %s deadlocks with a connection delete (#2534)",
      async (_m, run) => {
        if (_m === "PATCH") rows.set(ontologyConcepts, [CUSTOMER]);
        mockDb.transaction.mockRejectedValueOnce(
          Object.assign(new Error("deadlock detected"), {
            cause: { code: "40P01" },
          }),
        );
        const res = await run();
        expect(res.status).toBe(409);
        expect(JSON.stringify(await res.json())).toContain("try again");
      },
    );

    it.each([
      ["POST", () => post(), () => mockDb.transaction],
      ["PATCH", () => patch(body()), () => mockDb.transaction],
      [
        "DELETE",
        () => DELETE(makeRequest({}), makeParams("k1")),
        () => mockDb.delete,
      ],
      ["GET", () => GET(new Request(URL_ALL)), () => mockDb.select],
    ])(
      "never echoes a failed statement from %s",
      async (name, run, failing) => {
        if (name !== "POST") {
          rows.set(ontologyConcepts, [CUSTOMER]);
          rows.set(ontologyConceptSides, [
            storedSide("k1", side("graph", "Person", "email")),
          ]);
        }
        const boom = new Error("Failed query: select * from ontology_concepts");
        failing().mockImplementationOnce(() => {
          throw boom;
        });
        const res = await run();
        expect(res.status).toBe(500);
        expect(JSON.stringify(await res.json())).not.toContain("Failed query");
      },
    );

    it.each([
      ["a parameter with a space", { parameter: "my customer" }],
      ["an empty parameter", { parameter: "" }],
      ["no sides", { sides: [] }],
      [
        "two identical sides",
        {
          sides: [
            side("sql", "customers", "email"),
            side("sql", "customers", "email"),
          ],
        },
      ],
      ["a name over 200 characters", { name: "x".repeat(201) }],
      ["a description over 2000 characters", { description: "x".repeat(2001) }],
    ])("refuses %s", async (_w, over) => {
      expect((await post(body(over))).status).toBe(400);
      expect(inserts).toEqual([]);
    });

    it("stores the parameter the way dashboard parameters are named, without a leading param_", async () => {
      await post(body({ parameter: "param_customer" }));
      const concept = inserts.find((i) => i.table === ontologyConcepts)
        ?.values as Record<string, unknown>;
      expect(concept.parameter).toBe("customer");
    });
  });

  describe("PATCH and DELETE", () => {
    beforeEach(() => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("k1", side("graph", "Person", "email")),
        storedSide("k1", side("sql", "customers", "email")),
      ]);
    });

    it("replaces a concept's fields and sides, filtered by tenant and id", async () => {
      const res = await patch(
        body({
          description: "Someone who buys",
          sides: [
            side("graph", "Person", "email"),
            side("sql", "orders", "customer_id"),
          ],
        }),
      );
      expect(res.status).toBe(200);
      expect(updates[0]).toMatchObject({ description: "Someone who buys" });
      const del = deletes.find((d) => d.table === ontologyConceptSides);
      expect(JSON.stringify(del?.where)).toContain('["tenant_id","t1"]');
      expect(JSON.stringify(del?.where)).toContain('["concept_id","k1"]');
      const added = inserts.find((i) => i.table === ontologyConceptSides)
        ?.values as unknown[];
      expect(added).toHaveLength(2);
    });

    it("lets a creator change the parameter when every side is on a connection they can use (#2553)", async () => {
      expect((await patch(body({ parameter: "cust" }))).status).toBe(200);
      expect(updates[0]).toMatchObject({ parameter: "cust" });
    });

    it("lets a concept keep its own name and parameter", async () => {
      expect((await patch(body())).status).toBe(200);
    });

    it("is 404 for a concept of another tenant, looked up by the session's tenant", async () => {
      mockRequireSession.mockResolvedValue({ ...CREATOR, tenantId: "t2" });
      rows.set(ontologyConcepts, []);
      expect((await patch(body())).status).toBe(404);
      expect((await DELETE(makeRequest({}), makeParams("k1"))).status).toBe(
        404,
      );
      expect(whereOf(ontologyConcepts)).toContain('["tenant_id","t2"]');
      expect(whereOf(ontologyConcepts)).not.toContain('"t1"');
    });

    it("is refused for a reader, on both", async () => {
      mockRequireSession.mockResolvedValue(READER);
      expect((await patch(body())).status).toBe(403);
      expect((await DELETE(makeRequest({}), makeParams("k1"))).status).toBe(
        403,
      );
      expect(deletes).toEqual([]);
    });

    describe("a concept with a side on a connection the creator cannot use", () => {
      beforeEach(() => rows.set(connections, [G]));
      const only = body({ sides: [side("graph", "Person", "email")] });
      const sidesDelete = () =>
        JSON.stringify(
          deletes
            .filter((d) => d.table === ontologyConceptSides)
            .map((d) => d.where),
        );

      it("keeps the hidden side when the creator edits their own", async () => {
        const res = await patch(only);
        expect(res.status).toBe(200);
        // Only the graph sides are replaced; the sql side is never deleted.
        expect(sidesDelete()).toContain('["connection_id",["graph"]]');
        expect(sidesDelete()).not.toContain("sql");
        const added = inserts.find((i) => i.table === ontologyConceptSides)
          ?.values as { connectionId: string }[];
        expect(added.map((a) => a.connectionId)).toEqual(["graph"]);
      });

      it("still refuses a side in the body on a connection they cannot use", async () => {
        expect((await patch(body())).status).toBe(403);
        expect(updates).toEqual([]);
      });

      it("removes only their sides on delete, and keeps the concept", async () => {
        const res = await DELETE(makeRequest({}), makeParams("k1"));
        expect(res.status).toBe(200);
        expect(sidesDelete()).toContain('["connection_id",["graph"]]');
        expect(deletes.some((d) => d.table === ontologyConcepts)).toBe(false);
      });

      it("reveals nothing of the hidden side in either answer", async () => {
        const patched = JSON.stringify(await (await patch(only)).json());
        const deleted = JSON.stringify(
          await (await DELETE(makeRequest({}), makeParams("k1"))).json(),
        );
        for (const text of [patched, deleted]) {
          expect(text).not.toMatch(/sql|customers/);
        }
      });

      it("answers 404, like a missing id, when none of the sides is theirs", async () => {
        rows.set(ontologyConceptSides, [
          storedSide("k1", side("sql", "customers", "email")),
        ]);
        expect((await patch(only)).status).toBe(404);
        expect((await DELETE(makeRequest({}), makeParams("k1"))).status).toBe(
          404,
        );
        expect(deletes).toEqual([]);
      });

      it("decides inside the transaction, so a side added meanwhile survives the delete", async () => {
        rows.set(ontologyConceptSides, [
          storedSide("k1", side("graph", "Person", "email")),
        ]);
        mockDb.transaction.mockImplementationOnce((fn) => {
          // Another creator adds a side on a connection this one cannot use.
          rows.set(ontologyConceptSides, [
            storedSide("k1", side("graph", "Person", "email")),
            storedSide("k1", side("sql", "customers", "email")),
          ]);
          return fn(mockDb);
        });
        expect((await DELETE(makeRequest({}), makeParams("k1"))).status).toBe(
          200,
        );
        expect(deletes.some((d) => d.table === ontologyConcepts)).toBe(false);
        expect(sidesDelete()).toContain('["connection_id",["graph"]]');
      });

      it("answers 404 when the concept is gone by the time the edit locks it", async () => {
        mockDb.transaction.mockImplementationOnce((fn) => {
          rows.set(ontologyConcepts, []);
          return fn(mockDb);
        });
        expect((await patch(only)).status).toBe(404);
        expect(inserts).toEqual([]);
      });

      describe("changing the parameter (#2553)", () => {
        it("refuses a creator, writes nothing, and says to ask an admin", async () => {
          const res = await patch({
            ...only,
            name: "Buyer",
            parameter: "cust",
          });
          expect(res.status).toBe(403);
          expect(JSON.stringify(await res.json())).toContain(
            "ask an admin to change its parameter",
          );
          expect(updates).toEqual([]);
          expect(deletes).toEqual([]);
          expect(inserts).toEqual([]);
        });

        it("still lets the creator change the name and description", async () => {
          const res = await patch({
            ...only,
            name: "Buyer",
            description: "Someone",
          });
          expect(res.status).toBe(200);
          expect(updates[0]).toMatchObject({
            name: "Buyer",
            parameter: "customer",
          });
        });

        it("lets an admin change it", async () => {
          mockRequireSession.mockResolvedValue(ADMIN);
          rows.set(connections, [G, S]);
          expect((await patch(body({ parameter: "cust" }))).status).toBe(200);
          expect(updates[0]).toMatchObject({ parameter: "cust" });
        });
      });

      it("lets an admin change every side and delete the whole concept", async () => {
        mockRequireSession.mockResolvedValue(ADMIN);
        rows.set(connections, [G, S]);
        expect((await patch(body())).status).toBe(200);
        const del = deletes.find((d) => d.table === ontologyConceptSides);
        expect(JSON.stringify(del?.where)).not.toContain("connection_id");
        deletes.length = 0;
        expect((await DELETE(makeRequest({}), makeParams("k1"))).status).toBe(
          200,
        );
        expect(deletes.some((d) => d.table === ontologyConcepts)).toBe(true);
      });
    });

    it("deletes a concept by tenant and id", async () => {
      const res = await DELETE(makeRequest({}), makeParams("k1"));
      expect(res.status).toBe(200);
      const del = deletes.find((d) => d.table === ontologyConcepts);
      expect(JSON.stringify(del?.where)).toContain('["tenant_id","t1"]');
      expect(JSON.stringify(del?.where)).toContain('["id","k1"]');
    });
  });
});
