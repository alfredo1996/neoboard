import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeParams, makeRequest } from "@/__tests__/helpers/request-helpers";
import { nextResponseMockFactory } from "@/__tests__/helpers/next-mocks";
import type { SchemaTerm } from "@neoboard/connection";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRequireSession = vi.fn();
const mockFetchTerms = vi.fn<() => Promise<SchemaTerm[]>>();
const selects: unknown[][] = [];
const wheres: unknown[] = [];
const upserts: unknown[] = [];
const sets: unknown[] = [];
const deletes: unknown[] = [];

// A select resolves to the next queued result, whether or not `.limit()` ends it.
function selectChain() {
  const rows = selects.shift() ?? [];
  return {
    from: () => ({
      where: (w: unknown) => {
        wheres.push(w);
        return Object.assign(Promise.resolve(rows), {
          limit: () => Promise.resolve(rows),
        });
      },
    }),
  };
}

const mockDb = {
  select: vi.fn(selectChain),
  insert: vi.fn(() => ({
    values: (v: unknown) => ({
      onConflictDoUpdate: (c: { set: unknown }) => {
        upserts.push(...(Array.isArray(v) ? v : [v]));
        sets.push(c.set);
        return Promise.resolve();
      },
    }),
  })),
  delete: vi.fn(() => ({
    where: (w: unknown) => {
      deletes.push(w);
      return Promise.resolve();
    },
  })),
  transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(mockDb)),
};

class ForbiddenError extends Error {}
class UnauthorizedError extends Error {}

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/crypto/crypto", () => ({ decryptJson: () => ({}) }));
vi.mock("@/lib/connector/schema-prefetch", () => ({
  fetchConnectionTerms: mockFetchTerms,
}));
vi.mock("next/server", () => nextResponseMockFactory());
vi.mock("@/lib/auth/errors", () => ({ UnauthorizedError, ForbiddenError }));
// Record what each predicate compares, so a filter can be asserted.
vi.mock("drizzle-orm", async (orig) => ({
  ...(await orig<typeof import("drizzle-orm")>()),
  eq: (col: { name: string }, val: unknown) => ({ eq: [col.name, val] }),
  and: (...parts: unknown[]) => ({ and: parts }),
  or: (...parts: unknown[]) => ({ or: parts }),
}));

const CREATOR = {
  userId: "u1",
  role: "creator",
  canWrite: true,
  tenantId: "t1",
};
const READER = {
  userId: "u2",
  role: "reader",
  canWrite: false,
  tenantId: "t1",
};
const ADMIN = { ...CREATOR, userId: "u3", role: "admin" };
const CONN = { id: "c1", userId: "u1", type: "x", configEncrypted: "enc" };

const LIVE: SchemaTerm[] = [
  { kind: "entity", key: "Person", parentKey: "" },
  { kind: "property", key: "name", parentKey: "entity:Person", type: "String" },
];

type Ctx = { params: Promise<{ id: string }> };
type Handler = (req: Request, ctx: Ctx) => Promise<Response>;

describe("/api/connections/[id]/ontology", () => {
  let GET: Handler;
  let PUT: Handler;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();
    selects.length = 0;
    wheres.length = 0;
    upserts.length = 0;
    sets.length = 0;
    deletes.length = 0;
    mockFetchTerms.mockResolvedValue(LIVE);
    const mod = await import("../route");
    GET = mod.GET as Handler;
    PUT = mod.PUT as Handler;
  });

  const put = (terms: unknown[]) =>
    PUT(makeRequest({ terms }), makeParams("c1"));
  const edit = (over: object) => ({
    kind: "entity",
    key: "Person",
    parentKey: "",
    displayName: "",
    description: "",
    hidden: false,
    ...over,
  });

  describe("GET", () => {
    it.each([
      ["", false],
      ["?refresh=1", true],
    ])("with url %s asks for refresh=%s (#2514)", async (query, refresh) => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      await GET(new Request(`http://localhost/x${query}`), makeParams("c1"));
      expect(mockFetchTerms).toHaveBeenCalledWith("x", expect.anything(), {
        tenantId: "t1",
        connectionId: "c1",
        configEncrypted: "enc",
        refresh,
      });
    });

    it("is 404 for a connection the caller cannot use", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([]);
      const res = await GET(
        new Request("http://localhost/x"),
        makeParams("c1"),
      );
      expect(res.status).toBe(404);
    });

    it("merges the live structure with what is stored, filtered by the session's tenant", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push(
        [CONN],
        [
          {
            kind: "entity",
            key: "Person",
            parentKey: "",
            displayName: "Customer",
            description: "",
            hidden: false,
          },
        ],
      );
      const res = await GET(
        new Request("http://localhost/x"),
        makeParams("c1"),
      );
      expect(res.status).toBe(200);
      const { data } = await res.json();
      expect(data.terms[0]).toMatchObject({
        key: "Person",
        displayName: "Customer",
        orphaned: false,
      });
      // The stored-terms query carries the session's tenant and the connection.
      const storedWhere = JSON.stringify(wheres[1]);
      expect(storedWhere).toContain('["tenant_id","t1"]');
      expect(storedWhere).toContain('["connection_id","c1"]');
    });

    it.each([
      ["a creator", CREATOR, true],
      ["an admin", ADMIN, false],
    ])(
      "looks the connection up by the session's tenant, and by owner or shared for %s",
      async (_who, session, scoped) => {
        mockRequireSession.mockResolvedValue(session);
        selects.push([]);
        await GET(new Request("http://localhost/x"), makeParams("c1"));
        const w = JSON.stringify(wheres[0]);
        expect(w).toContain('["id","c1"]');
        expect(w).toContain('["tenant_id","t1"]');
        expect(w.includes('["visibility","shared"]')).toBe(scoped);
        expect(w.includes(`["userId","${session.userId}"]`)).toBe(scoped);
      },
    );

    it("ignores refresh=1 from a reader and serves the cached read (#2534)", async () => {
      mockRequireSession.mockResolvedValue({ ...CREATOR, role: "reader" });
      selects.push([CONN], []);
      await GET(new Request("http://localhost/x?refresh=1"), makeParams("c1"));
      expect(mockFetchTerms).toHaveBeenCalledWith(
        "x",
        expect.anything(),
        expect.objectContaining({ refresh: false }),
      );
    });

    it("is the same for a reader, who may read", async () => {
      mockRequireSession.mockResolvedValue(READER);
      selects.push([CONN], []);
      const res = await GET(
        new Request("http://localhost/x"),
        makeParams("c1"),
      );
      expect(res.status).toBe(200);
    });
  });

  describe("PUT", () => {
    it("checks keys against the cached read, never a fresh one (#2514)", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      await put([edit({ displayName: "x" })]);
      expect(mockFetchTerms).toHaveBeenCalledWith("x", expect.anything(), {
        tenantId: "t1",
        connectionId: "c1",
        configEncrypted: "enc",
        refresh: false,
      });
      expect(mockFetchTerms).toHaveBeenCalledTimes(1);
    });

    it("reads once more, past the cache, for a key it does not know, and saves it when the database has it", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN]);
      const fresh: SchemaTerm = { kind: "entity", key: "Newer", parentKey: "" };
      mockFetchTerms
        .mockResolvedValueOnce(LIVE)
        .mockResolvedValueOnce([...LIVE, fresh]);
      const res = await put([edit({ key: "Newer", displayName: "x" })]);
      expect(res.status).toBe(200);
      expect(mockFetchTerms).toHaveBeenCalledTimes(2);
      expect(mockFetchTerms).toHaveBeenLastCalledWith(
        "x",
        expect.anything(),
        expect.objectContaining({ refresh: true }),
      );
    });

    it("refuses a reader and writes nothing", async () => {
      mockRequireSession.mockResolvedValue(READER);
      selects.push([CONN]);
      const res = await put([edit({ displayName: "x" })]);
      expect(res.status).toBe(403);
      expect(upserts).toHaveLength(0);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("is 404 for a connection the caller cannot use", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([]);
      const res = await put([edit({ displayName: "x" })]);
      expect(res.status).toBe(404);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it.each([
      ["a creator", CREATOR, true],
      ["an admin", ADMIN, false],
    ])(
      "looks the connection up by the session's tenant, and by owner or shared for %s",
      async (_who, session, scoped) => {
        mockRequireSession.mockResolvedValue(session);
        selects.push([]);
        await put([edit({ displayName: "x" })]);
        const w = JSON.stringify(wheres[0]);
        expect(w).toContain('["id","c1"]');
        expect(w).toContain('["tenant_id","t1"]');
        expect(w.includes('["visibility","shared"]')).toBe(scoped);
        expect(w.includes(`["userId","${session.userId}"]`)).toBe(scoped);
      },
    );

    it("refuses a key the live structure does not report", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN]);
      const res = await put([edit({ key: "Nope", displayName: "x" })]);
      expect(res.status).toBe(400);
      expect(mockFetchTerms).toHaveBeenCalledTimes(2); // cached, then once fresh
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it.each([
      ["a name over 200 characters", { displayName: "a".repeat(201) }],
      [
        "a description over 2,000 characters",
        { description: "a".repeat(2001) },
      ],
      ["an unknown kind", { kind: "concept" }],
    ])("refuses %s", async (_label, over) => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN]);
      const res = await put([edit(over)]);
      expect(res.status).toBe(400);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("stores the meaning under the session's tenant, never the body's", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      const res = await put([
        {
          ...edit({ displayName: "Customer", hidden: true }),
          tenantId: "evil",
        },
      ]);
      expect(res.status).toBe(200);
      expect(upserts).toEqual([
        {
          tenantId: "t1",
          connectionId: "c1",
          kind: "entity",
          key: "Person",
          parentKey: "",
          displayName: "Customer",
          description: "",
          hidden: true,
        },
      ]);
    });

    it("stores a description exactly as text, markup included", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      await put([edit({ description: "<b>x</b>" })]);
      expect(upserts[0]).toMatchObject({ description: "<b>x</b>" });
    });

    it("changes only the fields it is sent, so two saves of one term cannot erase each other", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      await put([
        { kind: "entity", key: "Person", parentKey: "", description: "who" },
      ]);
      expect(upserts[0]).not.toHaveProperty("displayName");
      expect(upserts[0]).not.toHaveProperty("hidden");
      expect(Object.keys(sets[0] as object).sort()).toEqual([
        "description",
        "updatedAt",
      ]);
    });

    describe("a large save (#2534)", () => {
      const many = (n: number) =>
        Array.from({ length: n }, (_, i) => ({
          kind: "entity",
          key: `E${i}`,
          parentKey: "",
        }));

      it("is one insert and one cleanup delete for 1,000 terms", async () => {
        mockRequireSession.mockResolvedValue(CREATOR);
        selects.push([CONN], []);
        mockFetchTerms.mockResolvedValue(many(1000) as SchemaTerm[]);
        const res = await put(
          many(1000).map((t) => ({ ...t, displayName: `n-${t.key}` })),
        );
        expect(res.status).toBe(200);
        expect(mockDb.insert).toHaveBeenCalledTimes(1);
        expect(mockDb.delete).toHaveBeenCalledTimes(1);
        expect(upserts).toHaveLength(1000);
      });

      it("is one delete for 500 removals", async () => {
        mockRequireSession.mockResolvedValue(CREATOR);
        selects.push([CONN], []);
        await put(many(500).map((t) => ({ ...t, remove: true })));
        expect(mockDb.insert).not.toHaveBeenCalled();
        expect(mockDb.delete).toHaveBeenCalledTimes(1);
      });

      it("keeps each term's own fields: one insert per set of fields sent", async () => {
        mockRequireSession.mockResolvedValue(CREATOR);
        selects.push([CONN], []);
        await put([
          { kind: "entity", key: "Person", parentKey: "", displayName: "P" },
          {
            kind: "property",
            key: "name",
            parentKey: "entity:Person",
            hidden: true,
          },
        ]);
        expect(mockDb.insert).toHaveBeenCalledTimes(2);
        expect(sets.map((s) => Object.keys(s as object).sort())).toEqual([
          ["displayName", "updatedAt"],
          ["hidden", "updatedAt"],
        ]);
      });

      it("writes an explicit empty name, and each upsert sets only its own term's fields", async () => {
        mockRequireSession.mockResolvedValue(CREATOR);
        selects.push([CONN], []);
        await put([
          { kind: "entity", key: "Person", parentKey: "", displayName: "" },
          {
            kind: "property",
            key: "name",
            parentKey: "entity:Person",
            hidden: true,
          },
        ]);
        // two shapes, so two upserts: the ON CONFLICT SET of one never names
        // a column the other term was sent, and so cannot overwrite it
        expect(upserts).toEqual([
          expect.objectContaining({ key: "Person", displayName: "" }),
          expect.objectContaining({ key: "name", hidden: true }),
        ]);
        expect(upserts[0]).not.toHaveProperty("hidden");
        expect(upserts[1]).not.toHaveProperty("displayName");
        expect(sets.map((x) => Object.keys(x as object).sort())).toEqual([
          ["displayName", "updatedAt"],
          ["hidden", "updatedAt"],
        ]);
      });

      it("writes a term sent twice once, the later one winning", async () => {
        mockRequireSession.mockResolvedValue(CREATOR);
        selects.push([CONN], []);
        await put([
          edit({ displayName: "first" }),
          edit({ displayName: "second" }),
        ]);
        expect(upserts).toHaveLength(1);
        expect(upserts[0]).toMatchObject({ displayName: "second" });
      });
    });

    it("then drops the row if nothing is said about the term any more", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      const res = await put([edit({})]);
      expect(res.status).toBe(200);
      const w = JSON.stringify(deletes[0]);
      expect(w).toContain('["tenant_id","t1"]');
      expect(w).toContain('["display_name",""]');
      expect(w).toContain('["description",""]');
      expect(w).toContain('["hidden",false]');
    });

    it("removes the stored meaning of a term the connection no longer reports", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      const res = await put([
        { kind: "entity", key: "Gone", parentKey: "", remove: true },
      ]);
      expect(res.status).toBe(200);
      expect(upserts).toHaveLength(0);
      const w = JSON.stringify(deletes[0]);
      expect(w).toContain('["tenant_id","t1"]');
      expect(w).toContain('["key","Gone"]');
    });

    it("still refuses to edit a term the connection no longer reports", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN]);
      const res = await put([edit({ key: "Gone", displayName: "x" })]);
      expect(res.status).toBe(400);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it("lets a reader remove nothing", async () => {
      mockRequireSession.mockResolvedValue(READER);
      const res = await put([
        { kind: "entity", key: "Gone", parentKey: "", remove: true },
      ]);
      expect(res.status).toBe(403);
      expect(mockDb.delete).not.toHaveBeenCalled();
    });
  });
});
