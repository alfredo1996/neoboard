import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import type { SchemaTerm } from "@neoboard/connection";
import {
  connections,
  ontologyConcepts,
  ontologyConceptSides,
  ontologyTerms,
} from "@/lib/db/schema";

// A db whose tables hold what a test puts there; every predicate and write is
// recorded so tenant filters and what an import writes can be asserted.
const mockRequireSession = vi.fn();
const mockFetchTerms = vi.fn<(type: string) => Promise<SchemaTerm[]>>();
const rows = new Map<unknown, unknown[]>();
const wheres: { table: unknown; where: unknown }[] = [];
const inserts: { table: unknown; values: unknown }[] = [];
const updates: { table: unknown; set: unknown }[] = [];
const deletes: unknown[] = [];
// Reads in order, so a test can see a row lock taken before the sides are read.
const reads: string[] = [];

const mockDb = {
  select: vi.fn(() => ({
    from: (table: unknown) => ({
      where: (where: unknown) => {
        wheres.push({ table, where });
        const r = rows.get(table) ?? [];
        reads.push(table === ontologyConceptSides ? "sides" : "other");
        return Object.assign(Promise.resolve(r), {
          orderBy: () => Promise.resolve(r),
          for: (mode: string) => {
            reads[reads.length - 1] = `lock:${mode}`;
            return Promise.resolve(r);
          },
        });
      },
    }),
  })),
  insert: vi.fn((table: unknown) => ({
    values: (values: unknown) => {
      inserts.push({ table, values });
      return Object.assign(Promise.resolve(), {
        onConflictDoUpdate: () => Promise.resolve(),
        onConflictDoNothing: () => Promise.resolve(),
      });
    },
  })),
  update: vi.fn((table: unknown) => ({
    set: (set: unknown) => ({
      where: () => {
        updates.push({ table, set });
        return Promise.resolve();
      },
    }),
  })),
  delete: vi.fn(() => ({
    where: () => {
      deletes.push(1);
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
const ent = (key: string): SchemaTerm => ({
  kind: "entity",
  key,
  parentKey: "",
});
const prop = (entity: string, key: string): SchemaTerm => ({
  kind: "property",
  key,
  parentKey: `entity:${entity}`,
});
const TERMS: Record<string, SchemaTerm[]> = {
  "type-graph": [ent("Person"), prop("Person", "email")],
  "type-sql": [ent("customers"), prop("customers", "email")],
};

const stored = (connectionId: string, over: object = {}, tenantId = "t1") => ({
  tenantId,
  connectionId,
  kind: "entity",
  key: "Person",
  parentKey: "",
  displayName: "Human",
  description: "A person",
  hidden: false,
  ...over,
});
const side = (
  connectionId: string,
  entityKey: string,
  keyPropertyKey: string,
) => ({ connectionId, entityKey, keyPropertyKey });
const storedSide = (
  id: string,
  s: ReturnType<typeof side>,
  conceptId = "k1",
) => ({
  id,
  tenantId: "t1",
  conceptId,
  ...s,
});
const CUSTOMER = {
  id: "k1",
  tenantId: "t1",
  name: "Customer",
  parameter: "customer",
  description: "A buyer",
};

type Handler = (req?: Request) => Promise<Response>;

const fileOf = (over: object = {}) => ({
  format: "neoboard-ontology",
  version: 1,
  connections: [
    {
      id: "f-graph",
      name: "Graph",
      terms: [
        {
          kind: "entity",
          key: "Person",
          parentKey: "",
          displayName: "Human",
          description: "A person",
          hidden: false,
        },
      ],
    },
    { id: "f-sql", name: "Sql", terms: [] },
  ],
  concepts: [
    {
      name: "Customer",
      parameter: "customer",
      description: "A buyer",
      sides: [
        side("f-graph", "Person", "email"),
        side("f-sql", "customers", "email"),
      ],
    },
  ],
  ...over,
});

describe("ontology export and import (#2510)", () => {
  let GET: Handler;
  let POST: Handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    rows.clear();
    for (const l of [wheres, inserts, updates, deletes, reads]) l.length = 0;
    mockFetchTerms.mockImplementation(async (type) => TERMS[type] ?? []);
    mockRequireSession.mockResolvedValue(CREATOR);
    rows.set(connections, [conn("graph"), conn("sql")]);
    rows.set(ontologyTerms, []);
    rows.set(ontologyConcepts, []);
    rows.set(ontologyConceptSides, []);
    GET = (await import("../export/route")).GET as Handler;
    POST = (await import("../import/route")).POST as Handler;
  });

  const whereOf = (table: unknown) =>
    JSON.stringify(wheres.filter((w) => w.table === table).map((w) => w.where));
  const importBody = (over: object = {}) => ({
    payload: fileOf(),
    connectionMapping: { "f-graph": "graph", "f-sql": "sql" },
    ...over,
  });
  const post = (b: object = importBody()) => POST(makeRequest(b));
  const writesTo = (table: unknown) => inserts.filter((i) => i.table === table);

  describe("export", () => {
    const bothSides = [
      storedSide("s1", side("graph", "Person", "email")),
      storedSide("s2", side("sql", "customers", "email")),
    ];
    beforeEach(() => {
      rows.set(ontologyTerms, [
        stored("graph"),
        stored("sql", { key: "customers" }),
      ]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, bothSides);
    });

    it("writes the format, the terms and the concepts, and nothing about structure, config or tenant", async () => {
      const { data } = await (await GET()).json();
      expect(data.format).toBe("neoboard-ontology");
      expect(data.version).toBe(1);
      expect(data.connections.map((c: { id: string }) => c.id)).toEqual([
        "graph",
        "sql",
      ]);
      expect(data.connections[0].terms[0]).toEqual({
        kind: "entity",
        key: "Person",
        parentKey: "",
        displayName: "Human",
        description: "A person",
        hidden: false,
      });
      expect(data.concepts[0].sides).toHaveLength(2);
      const text = JSON.stringify(data);
      expect(text).not.toContain("enc");
      expect(text).not.toContain('"t1"');
      expect(text).not.toContain("type-graph");
      expect(mockFetchTerms).not.toHaveBeenCalled();
    });

    it("keeps to the tenant in every query", async () => {
      await GET();
      for (const t of [ontologyTerms, ontologyConcepts, ontologyConceptSides]) {
        expect(whereOf(t)).toContain('"t1"');
      }
    });

    it("holds only the sides on connections the caller can use, and no concept left without one", async () => {
      rows.set(connections, [conn("graph")]); // sql is not usable
      rows.set(ontologyConcepts, [
        CUSTOMER,
        { ...CUSTOMER, id: "k2", name: "Order", parameter: "order" },
      ]);
      rows.set(ontologyConceptSides, [
        ...bothSides,
        storedSide("s3", side("sql", "orders", "id"), "k2"),
      ]);
      const { data } = await (await GET()).json();
      expect(data.connections.map((c: { id: string }) => c.id)).toEqual([
        "graph",
      ]);
      expect(data.concepts.map((c: { name: string }) => c.name)).toEqual([
        "Customer",
      ]);
      expect(data.concepts[0].sides).toEqual([
        side("graph", "Person", "email"),
      ]);
    });
  });

  describe("import", () => {
    it("a reader gets 403 and nothing is written", async () => {
      mockRequireSession.mockResolvedValue(READER);
      const res = await post(importBody({ apply: true }));
      expect(res.status).toBe(403);
      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(inserts).toHaveLength(0);
    });

    it.each([
      ["an unknown format", { format: "something-else" }, "neoboard-ontology"],
      ["a newer version", { version: 2 }, "newer"],
    ])("refuses %s and says why", async (_n, over, why) => {
      const res = await post(importBody({ payload: fileOf(over) }));
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain(why);
    });

    it.each([
      ["a name over 200 characters", { name: "x".repeat(201) }],
      [
        "a description over 2,000 characters",
        { description: "x".repeat(2001) },
      ],
    ])("refuses a concept with %s", async (_n, over) => {
      const file = fileOf();
      file.concepts[0] = { ...file.concepts[0], ...over };
      const res = await post(importBody({ payload: file, apply: true }));
      expect(res.status).toBe(400);
      expect(inserts).toHaveLength(0);
    });

    it("refuses a term name over the cap", async () => {
      const file = fileOf();
      file.connections[0].terms[0].displayName = "x".repeat(201);
      expect((await post(importBody({ payload: file }))).status).toBe(400);
    });

    it("refuses a mapping to a connection the importer cannot use", async () => {
      const res = await post(
        importBody({ connectionMapping: { "f-graph": "hidden" } }),
      );
      expect(res.status).toBe(403);
      expect(inserts).toHaveLength(0);
    });

    it("previews without writing and counts what is new", async () => {
      const { data } = await (await post()).json();
      expect(data.applied).toBe(false);
      expect(data.preview.terms.new).toBe(1);
      expect(data.preview.concepts.new).toBe(1);
      expect(inserts).toHaveLength(0);
      expect(updates).toHaveLength(0);
    });

    it("the preview marks what changes and what is unchanged", async () => {
      rows.set(ontologyTerms, [stored("graph", { description: "Old" })]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("s1", side("graph", "Person", "email")),
        storedSide("s2", side("sql", "customers", "email")),
      ]);
      const { data } = await (await post()).json();
      expect(data.preview.terms).toMatchObject({ new: 0, changed: 1 });
      expect(data.preview.concepts).toMatchObject({
        new: 0,
        changed: 0,
        unchanged: 1,
      });
    });

    it("applies the mapping: terms land on the target, not the file's id", async () => {
      rows.set(connections, [conn("sql")]); // the mock ignores the id filter
      await post(
        importBody({ apply: true, connectionMapping: { "f-graph": "sql" } }),
      );
      const written = writesTo(ontologyTerms).flatMap(
        (w) => w.values as { connectionId: string }[],
      );
      expect(written.map((w) => w.connectionId)).toEqual(["sql"]);
    });

    it("skips a connection that is not mapped, with its terms and concept sides", async () => {
      rows.set(connections, [conn("graph")]); // the mock ignores the id filter
      const mapping = { connectionMapping: { "f-graph": "graph" } };
      const { data } = await (await post(importBody(mapping))).json();
      expect(data.preview.concepts.skippedSides).toBe(1);
      await post(importBody({ ...mapping, apply: true }));
      const sides = writesTo(ontologyConceptSides).flatMap(
        (i) => i.values as { connectionId: string }[],
      );
      expect(sides.map((s) => s.connectionId)).toEqual(["graph"]);
    });

    it("skips a concept whose every side is on a connection that is not mapped", async () => {
      rows.set(connections, []);
      const { data } = await (
        await post(importBody({ connectionMapping: {} }))
      ).json();
      expect(data.preview.concepts.skipped).toBe(1);
      expect(data.preview.terms.skipped).toBe(1);
    });

    it("skips a side whose connection the file does not list", async () => {
      const file = fileOf();
      file.concepts[0].sides.push(side("not-in-file", "x", "y"));
      const { data } = await (await post(importBody({ payload: file }))).json();
      expect(data.preview.concepts.skippedSides).toBe(1);
    });

    it("the file wins: a stored description is replaced, and a concept matched by parameter is updated", async () => {
      rows.set(ontologyTerms, [stored("graph", { description: "Old" })]);
      rows.set(ontologyConcepts, [
        { ...CUSTOMER, name: "Client", description: "Old" },
      ]);
      rows.set(ontologyConceptSides, [
        storedSide("s1", side("graph", "Person", "email")),
      ]);
      await post(importBody({ apply: true }));
      const row = writesTo(ontologyTerms)[0].values as {
        description: string;
      }[];
      expect(row[0].description).toBe("A person");
      expect(updates[0].set).toMatchObject({
        name: "Customer",
        description: "A buyer",
      });
      expect(writesTo(ontologyConcepts)).toHaveLength(0);
    });

    it("deletes nothing the file does not hold", async () => {
      rows.set(ontologyTerms, [stored("graph", { key: "Other" })]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("s9", side("graph", "Company", "id")),
      ]);
      await post(importBody({ apply: true }));
      expect(deletes).toHaveLength(0);
    });

    it("writes a key the live structure no longer has, and the preview calls it orphaned", async () => {
      mockFetchTerms.mockResolvedValue([ent("Company")]);
      const { data } = await (await post()).json();
      expect(data.preview.terms.orphaned).toBe(1);
      await post(importBody({ apply: true }));
      expect(writesTo(ontologyTerms)).toHaveLength(1);
    });

    it("does not call a term orphaned when the connection's structure cannot be read", async () => {
      mockFetchTerms.mockRejectedValue(new Error("down"));
      const { data } = await (await post()).json();
      expect(data.preview.terms.orphaned).toBe(0);
    });

    it("takes the tenant from the session, never from the file", async () => {
      await post(
        importBody({ payload: fileOf({ tenantId: "evil" }), apply: true }),
      );
      expect(JSON.stringify(inserts.map((i) => i.values))).not.toContain(
        "evil",
      );
      expect(writesTo(ontologyTerms).length).toBeGreaterThan(0);
      for (const t of [
        connections,
        ontologyTerms,
        ontologyConcepts,
        ontologyConceptSides,
      ]) {
        expect(whereOf(t)).toContain('"t1"');
      }
      for (const w of inserts) {
        for (const v of [w.values].flat() as { tenantId: string }[]) {
          expect(v.tenantId).toBe("t1");
        }
      }
    });

    it("writes new concepts and all their sides in two inserts, not two per concept (#2534)", async () => {
      const { writePlan } = await import("@/lib/ontology/import-export");
      const conceptWrites = Array.from({ length: 50 }, (_, i) => ({
        name: `C${i}`,
        parameter: `c${i}`,
        description: "",
        sides: [
          { connectionId: "graph", entityKey: `E${i}`, keyPropertyKey: "id" },
          { connectionId: "sql", entityKey: `T${i}`, keyPropertyKey: "id" },
        ],
      }));
      await writePlan(mockDb as never, "t1", { termRows: [], conceptWrites });
      const concepts = writesTo(ontologyConcepts);
      const sides = writesTo(ontologyConceptSides);
      expect(concepts).toHaveLength(1);
      expect(concepts[0].values).toHaveLength(50);
      expect(sides).toHaveLength(1);
      expect(sides[0].values).toHaveLength(100);
    });

    it("writes in one transaction", async () => {
      await post(importBody({ apply: true }));
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);
    });

    it("an admin may import", async () => {
      mockRequireSession.mockResolvedValue(ADMIN);
      expect((await post()).status).toBe(200);
    });

    it("skips a concept whose name and parameter belong to two different concepts", async () => {
      rows.set(ontologyConcepts, [
        CUSTOMER,
        { ...CUSTOMER, id: "k2", name: "Other", parameter: "customer2" },
      ]);
      const file = fileOf();
      file.concepts[0].parameter = "customer2"; // name -> k1, parameter -> k2
      const { data } = await (await post(importBody({ payload: file }))).json();
      expect(data.preview.concepts.skipped).toBe(1);
    });

    it.each([
      ["name", { name: "Customer", parameter: "other_param" }],
      ["parameter", { name: "Other name", parameter: "customer" }],
    ])(
      "skips, and never updates, a concept matched by %s that the creator cannot see",
      async (_n, hidden) => {
        // Its only side is on a connection the creator cannot use.
        rows.set(connections, [conn("sql")]);
        rows.set(ontologyConcepts, [{ ...CUSTOMER, ...hidden }]);
        rows.set(ontologyConceptSides, [
          storedSide("s9", side("secret", "Person", "email")),
        ]);
        const file = fileOf();
        file.concepts[0].sides = [side("f-sql", "customers", "email")];
        const res = await post(
          importBody({
            payload: file,
            connectionMapping: { "f-sql": "sql" },
            apply: true,
          }),
        );
        const { data } = await res.json();
        expect(data.preview.concepts).toMatchObject({
          skipped: 1,
          changed: 0,
          new: 0,
        });
        expect(JSON.stringify(data.preview.items)).not.toContain("Customer");
        expect(updates.filter((u) => u.table === ontologyConcepts)).toEqual([]);
        expect(writesTo(ontologyConceptSides)).toHaveLength(0);
        expect(writesTo(ontologyConcepts)).toHaveLength(0);
      },
    );

    it("skips, and never updates, a concept whose parameter the file changes when a side is on a connection the creator cannot use (#2553)", async () => {
      rows.set(ontologyConcepts, [{ ...CUSTOMER, parameter: "old_param" }]);
      rows.set(ontologyConceptSides, [
        storedSide("s1", side("graph", "Person", "email")),
        storedSide("s9", side("secret", "Person", "email")),
      ]);
      const { data } = await (await post(importBody({ apply: true }))).json();
      expect(data.preview.concepts).toMatchObject({ skipped: 1, changed: 0 });
      expect(updates.filter((u) => u.table === ontologyConcepts)).toEqual([]);
    });

    it.each([
      {
        who: "a creator whose sides are all visible",
        session: CREATOR,
        stored: [storedSide("s1", side("graph", "Person", "email"))],
      },
      {
        who: "an admin, though a side is hidden from creators",
        session: ADMIN,
        stored: [
          storedSide("s1", side("graph", "Person", "email")),
          storedSide("s9", side("secret", "Person", "email")),
        ],
      },
    ])(
      "renames a matched concept's parameter for $who (#2553)",
      async ({ session, stored }) => {
        mockRequireSession.mockResolvedValue(session);
        rows.set(ontologyConcepts, [{ ...CUSTOMER, parameter: "old_param" }]);
        rows.set(ontologyConceptSides, stored);
        const { data } = await (await post(importBody({ apply: true }))).json();
        expect(data.preview.concepts).toMatchObject({ changed: 1, skipped: 0 });
        expect(
          updates.filter((u) => u.table === ontologyConcepts),
        ).toMatchObject([{ set: { parameter: "customer" } }]);
      },
    );

    it.each([
      { apply: true, expected: ["lock:update", "sides"] },
      { apply: false, expected: ["sides"] },
    ])(
      "locks the concept rows before reading the sides only when applying (apply=$apply, #2553)",
      async ({ apply, expected }) => {
        rows.set(ontologyConcepts, [CUSTOMER]);
        await post(importBody({ apply }));
        const tail = reads.filter((r) => r !== "other");
        expect(tail).toEqual(expected);
      },
    );

    it("lets an admin match a concept whose sides are on connections they cannot use", async () => {
      mockRequireSession.mockResolvedValue(ADMIN);
      rows.set(connections, [conn("sql")]);
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("s9", side("secret", "Person", "email")),
      ]);
      const file = fileOf();
      file.concepts[0].sides = [side("f-sql", "customers", "email")];
      const { data } = await (
        await post(
          importBody({
            payload: file,
            connectionMapping: { "f-sql": "sql" },
          }),
        )
      ).json();
      expect(data.preview.concepts.changed).toBe(1);
    });

    it("writes one row per term when two file connections map to one local connection", async () => {
      rows.set(connections, [conn("graph")]);
      const file = fileOf();
      file.connections[1].terms = [...file.connections[0].terms];
      await post(
        importBody({
          payload: file,
          connectionMapping: { "f-graph": "graph", "f-sql": "graph" },
          apply: true,
        }),
      );
      expect(writesTo(ontologyTerms)[0].values).toHaveLength(1);
    });

    it("writes one side when two file connections map to one local connection (CR1)", async () => {
      rows.set(connections, [conn("graph")]);
      const file = fileOf();
      file.concepts[0].sides = [
        side("f-graph", "Person", "email"),
        side("f-sql", "Person", "email"),
      ];
      const mapping = { "f-graph": "graph", "f-sql": "graph" };
      const { data } = await (
        await post(importBody({ payload: file, connectionMapping: mapping }))
      ).json();
      expect(data.preview.concepts.new).toBe(1);
      await post(
        importBody({ payload: file, connectionMapping: mapping, apply: true }),
      );
      expect(writesTo(ontologyConceptSides)[0].values).toHaveLength(1);
    });

    it("does not re-insert a side the stored concept already has (CR1)", async () => {
      rows.set(ontologyConcepts, [CUSTOMER]);
      rows.set(ontologyConceptSides, [
        storedSide("s1", side("graph", "Person", "email")),
      ]);
      const file = fileOf();
      file.concepts[0].sides = [side("f-graph", "Person", "email")];
      await post(importBody({ payload: file, apply: true }));
      expect(writesTo(ontologyConceptSides)).toHaveLength(0);
    });

    it("403s an unusable mapped target before any introspection or write (CR4)", async () => {
      rows.set(connections, [conn("graph")]); // the mock ignores the id filter
      const res = await post(
        importBody({
          connectionMapping: { "f-graph": "graph", "f-sql": "hidden" },
          apply: true,
        }),
      );
      expect(res.status).toBe(403);
      expect(mockFetchTerms).not.toHaveBeenCalled();
      expect(mockDb.transaction).not.toHaveBeenCalled();
      expect(inserts).toHaveLength(0);
      expect(updates).toHaveLength(0);
    });

    it("a file connection id like an Object property is skipped, not mapped", async () => {
      rows.set(connections, []); // nothing is mapped, so nothing is usable
      const file = fileOf();
      file.connections[0].id = "constructor";
      file.concepts[0].sides[0].connectionId = "constructor";
      const { data } = await (
        await post(importBody({ payload: file, connectionMapping: {} }))
      ).json();
      expect(data.preview.terms.skipped).toBe(1);
      expect(data.preview.terms.new).toBe(0);
    });

    it("lists what it skipped, from the file's own data", async () => {
      rows.set(connections, [conn("graph")]);
      const file = fileOf();
      const { data } = await (
        await post(
          importBody({
            payload: file,
            connectionMapping: { "f-graph": "graph" },
          }),
        )
      ).json();
      expect(data.preview.skipped).toEqual([
        { kind: "side", label: "Customer: customers.email on Sql" },
      ]);
    });

    it("refuses a mapping for a connection the file does not hold", async () => {
      const res = await post(
        importBody({ connectionMapping: { nope: "graph" } }),
      );
      expect(res.status).toBe(400);
      expect((await res.json()).error.message).toContain("nope");
    });

    it("a 403 on a mapped connection speaks of the import, not a concept", async () => {
      const res = await post(
        importBody({ connectionMapping: { "f-graph": "hidden" } }),
      );
      expect(res.status).toBe(403);
      expect((await res.json()).error.message).not.toContain("concept");
    });

    it.each([
      [
        "two connections share an id",
        (f: ReturnType<typeof fileOf>) => {
          f.connections[1].id = "f-graph";
        },
      ],
      [
        "two concepts share a name",
        (f: ReturnType<typeof fileOf>) => {
          f.concepts.push({ ...f.concepts[0], parameter: "another" });
        },
      ],
      [
        "two concepts share a parameter",
        (f: ReturnType<typeof fileOf>) => {
          f.concepts.push({ ...f.concepts[0], name: "Another" });
        },
      ],
      [
        "a connection repeats a term",
        (f: ReturnType<typeof fileOf>) => {
          f.connections[0].terms.push({ ...f.connections[0].terms[0] });
        },
      ],
    ])("refuses a file where %s", async (_n, break_) => {
      const file = fileOf();
      break_(file);
      const res = await post(importBody({ payload: file, apply: true }));
      expect(res.status).toBe(400);
      expect(inserts).toHaveLength(0);
    });

    it("labels a property with its parent, and reads the live terms before the transaction", async () => {
      const file = fileOf();
      file.connections[0].terms.push({
        kind: "property",
        key: "name",
        parentKey: "entity:Person",
        displayName: "Name",
        description: "",
        hidden: false,
      } as never);
      const order: string[] = [];
      mockFetchTerms.mockImplementation(async () => {
        order.push("terms");
        return [];
      });
      mockDb.transaction.mockImplementationOnce(async (fn) => {
        order.push("tx");
        return fn(mockDb);
      });
      const { data } = await (
        await post(importBody({ payload: file, apply: true }))
      ).json();
      expect(
        data.preview.items.map((i: { label: string }) => i.label),
      ).toContain("Graph: property Person.name");
      expect(order.indexOf("terms")).toBeLessThan(order.indexOf("tx"));
    });

    it("answers 409, not 500, when a connection was deleted while it wrote (#2534)", async () => {
      mockDb.transaction.mockRejectedValueOnce(
        Object.assign(new Error("insert into ontology_concept_side"), {
          cause: { code: "23503" },
        }),
      );
      const res = await post(importBody({ apply: true }));
      expect(res.status).toBe(409);
      expect(JSON.stringify(await res.json())).not.toContain("insert into");
    });

    it("never echoes a SQL statement from a failed write", async () => {
      mockDb.transaction.mockRejectedValueOnce(
        new Error("insert into ontology_term (secret)"),
      );
      const res = await post(importBody({ apply: true }));
      expect(res.status).toBe(500);
      expect(JSON.stringify(await res.json())).not.toContain("insert into");
    });
  });
});
