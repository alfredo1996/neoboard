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
      onConflictDoUpdate: () => {
        upserts.push(v);
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
    it("is 404 for a connection the caller cannot use", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([]);
      const res = await GET({} as Request, makeParams("c1"));
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
      const res = await GET({} as Request, makeParams("c1"));
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

    it("is the same for a reader, who may read", async () => {
      mockRequireSession.mockResolvedValue(READER);
      selects.push([CONN], []);
      const res = await GET({} as Request, makeParams("c1"));
      expect(res.status).toBe(200);
    });
  });

  describe("PUT", () => {
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

    it("refuses a key the live structure does not report", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN]);
      const res = await put([edit({ key: "Nope", displayName: "x" })]);
      expect(res.status).toBe(400);
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

    it("removes the row when the term is emptied again", async () => {
      mockRequireSession.mockResolvedValue(CREATOR);
      selects.push([CONN], []);
      const res = await put([edit({})]);
      expect(res.status).toBe(200);
      expect(upserts).toHaveLength(0);
      expect(JSON.stringify(deletes[0])).toContain('["tenant_id","t1"]');
    });
  });
});
