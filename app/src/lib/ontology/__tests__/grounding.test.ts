import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ontologyConcepts,
  ontologyConceptSides,
  ontologyTerms,
} from "@/lib/db/schema";

// The tables and the schema read are stubbed, as in the other ontology tests.
const rows = new Map<unknown, unknown[]>();
vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: (table: unknown) => ({
        where: () => Promise.resolve(rows.get(table) ?? []),
      }),
    }),
  },
}));

type Conn = { id: string; tenantId: string; name: string; type: string };
let usable: Conn[] = [];
const live = new Map<string, unknown[] | undefined>();
let reads: string[] = [];
vi.mock("@/lib/ontology/concepts", async (orig) => ({
  ...(await orig<typeof import("@/lib/ontology/concepts")>()),
  usableConnections: vi.fn(async () => usable),
  liveTermsById: vi.fn(async (cs: Conn[]) => {
    reads.push(...cs.map((c) => c.id));
    return new Map(cs.map((c) => [c.id, live.get(c.id)]));
  }),
}));

// The language comes from the connector's descriptor: changing what the
// registry says changes the answer, whatever the type is called.
const LANGUAGE: Record<string, string> = {
  "type-a": "lang-a",
  "type-b": "lang-b",
};
vi.mock("@neoboard/connection", () => ({
  getConnector: (type: string) => ({ queryLanguage: LANGUAGE[type] }),
}));

import {
  getGroundingModel,
  GroundingStructureUnavailableError,
} from "../grounding";

const session = { userId: "u1", role: "creator", tenantId: "t1" } as const;
const conn = (id: string, type = "type-a"): Conn => ({
  id,
  tenantId: "t1",
  name: `name-${id}`,
  type,
});
const entity = (key: string) => ({ kind: "entity", key, parentKey: "" });
const prop = (entityKey: string, key: string) => ({
  kind: "property",
  key,
  parentKey: `entity:${entityKey}`,
  type: "String",
});
const stored = (
  t: { kind: string; key: string; parentKey: string },
  p: Record<string, unknown>,
) => ({
  ...t,
  connectionId: "c1",
  displayName: "",
  description: "",
  hidden: false,
  ...p,
});
const side = (conceptId: string, connectionId: string, e = "P", k = "id") => ({
  conceptId,
  connectionId,
  entityKey: e,
  keyPropertyKey: k,
});
const concept = (id: string, parameter = "person") => ({
  id,
  name: `Concept ${id}`,
  parameter,
  description: `about ${id}`,
});

beforeEach(() => {
  rows.clear();
  live.clear();
  reads = [];
  usable = [conn("c1"), conn("c2", "type-b")];
  live.set("c1", [entity("P"), prop("P", "id"), prop("P", "name")]);
  live.set("c2", [entity("Q"), prop("Q", "pid")]);
});

afterEach(() => {
  LANGUAGE["type-b"] = "lang-b";
});

describe("getGroundingModel terms", () => {
  it("drops hidden and orphaned terms and keeps the creator's words", async () => {
    rows.set(ontologyTerms, [
      stored(prop("P", "name"), { hidden: true }),
      stored(entity("P"), { displayName: "Person", description: "A human" }),
      stored(entity("Gone"), { displayName: "Gone" }),
    ]);
    const m = await getGroundingModel(session, "c1");
    expect(m?.terms.map((t) => t.key)).toEqual(["P", "id"]);
    expect(m?.terms[0]).toMatchObject({
      displayName: "Person",
      description: "A human",
    });
  });
});

describe("getGroundingModel hidden terms", () => {
  it("drops a hidden entity, its properties and a side on it", async () => {
    rows.set(ontologyTerms, [stored(entity("P"), { hidden: true })]);
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "pid"),
    ]);
    const m = await getGroundingModel(session, "c1");
    expect(m?.terms).toEqual([]);
    expect(m?.concepts).toEqual([]);
    // the other connection no longer sees it from c1 either
    const q = await getGroundingModel(session, "c2");
    expect(q?.concepts[0].otherSides).toEqual([]);
  });

  it("drops a side whose key property is hidden", async () => {
    rows.set(ontologyTerms, [stored(prop("P", "id"), { hidden: true })]);
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "pid"),
    ]);
    expect((await getGroundingModel(session, "c1"))?.concepts).toEqual([]);
  });

  it("drops another side hidden on its own connection", async () => {
    rows.set(ontologyTerms, [
      stored(entity("Q"), { hidden: true, connectionId: "c2" }),
    ]);
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "pid"),
    ]);
    const [c] = (await getGroundingModel(session, "c1"))?.concepts ?? [];
    expect(c.otherSides).toEqual([]);
  });

  it("drops a relationship's properties with it, and a join to a hidden entity", async () => {
    live.set("c1", [
      entity("P"),
      entity("H"),
      {
        kind: "relationship",
        key: "R",
        parentKey: "",
        joins: [
          { from: "P", to: "H" },
          { from: "P", to: "P" },
        ],
      },
      { kind: "relationship", key: "S", parentKey: "" },
      { kind: "property", key: "since", parentKey: "relationship:S" },
    ]);
    rows.set(ontologyTerms, [
      stored(entity("H"), { hidden: true }),
      stored(
        { kind: "relationship", key: "S", parentKey: "" },
        { hidden: true },
      ),
    ]);
    const m = await getGroundingModel(session, "c1");
    expect(m?.terms.map((t) => t.key)).toEqual(["P", "R"]);
    expect(m?.terms[1].joins).toEqual([{ from: "P", to: "P" }]);
  });
});

describe("getGroundingModel keys and joins", () => {
  it("reports primaryKey and joins, joins sorted", async () => {
    live.set("c1", [
      entity("P"),
      { ...prop("P", "id"), primaryKey: true },
      {
        kind: "relationship",
        key: "R",
        parentKey: "",
        joins: [
          { from: "P", to: "Z" },
          { from: "A", to: "P" },
        ],
      },
      entity("A"),
      entity("Z"),
    ]);
    const m = await getGroundingModel(session, "c1");
    expect(m?.terms.find((t) => t.key === "id")?.primaryKey).toBe(true);
    expect(m?.terms.find((t) => t.key === "R")?.joins).toEqual([
      { from: "A", to: "P" },
      { from: "P", to: "Z" },
    ]);
  });
});

describe("getGroundingModel connection", () => {
  it("reads each language from the connector, not from the type", async () => {
    usable = [conn("c1", "type-b"), conn("c2", "type-b")];
    expect((await getGroundingModel(session, "c1"))?.connection).toEqual({
      id: "c1",
      name: "name-c1",
      queryLanguage: "lang-b",
    });
    LANGUAGE["type-b"] = "changed";
    expect(
      (await getGroundingModel(session, "c1"))?.connection.queryLanguage,
    ).toBe("changed");
  });

  // The tenant filters on the queries are covered by the tenant-scope ratchet
  // (db/__tests__/tenant-scope.test.ts); this only proves the lookup by id.
  it("returns null for a connection the caller cannot use", async () => {
    expect(await getGroundingModel(session, "nope")).toBeNull();
  });

  it("throws, never an empty model, when its own structure cannot be read", async () => {
    live.set("c1", undefined);
    await expect(getGroundingModel(session, "c1")).rejects.toBeInstanceOf(
      GroundingStructureUnavailableError,
    );
  });
});

describe("getGroundingModel concepts", () => {
  it("renders the parameter as $param_<name> with the other sides' name and language", async () => {
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "pid"),
    ]);
    const [c] = (await getGroundingModel(session, "c1"))?.concepts ?? [];
    expect(c).toEqual({
      name: "Concept k1",
      description: "about k1",
      parameter: "$param_person",
      sides: [{ entityKey: "P", keyPropertyKey: "id" }],
      otherSides: [
        {
          connectionId: "c2",
          connectionName: "name-c2",
          queryLanguage: "lang-b",
          entityKey: "Q",
          keyPropertyKey: "pid",
        },
      ],
    });
  });

  it("keeps a concept only while a side on this connection is live", async () => {
    rows.set(ontologyConcepts, [concept("k1"), concept("k2", "other")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1", "P", "gone"), // key property gone
      side("k2", "c1", "Nope", "id"), // entity gone
      side("k2", "c2", "Q", "pid"),
    ]);
    expect((await getGroundingModel(session, "c1"))?.concepts).toEqual([]);
    // ...and the same concept is grounded from the connection where it is live
    expect((await getGroundingModel(session, "c2"))?.concepts).toHaveLength(1);
  });

  it("drops another side the live structure no longer reports", async () => {
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "gone"),
    ]);
    const [c] = (await getGroundingModel(session, "c1"))?.concepts ?? [];
    expect(c.otherSides).toEqual([]);
  });

  it("drops another side whose connection cannot be read", async () => {
    live.set("c2", undefined);
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "pid"),
    ]);
    const [c] = (await getGroundingModel(session, "c1"))?.concepts ?? [];
    expect(c.sides).toHaveLength(1);
    expect(c.otherSides).toEqual([]);
  });

  it("reads only the connections that share a concept with this one", async () => {
    usable = [conn("c1"), conn("c2", "type-b"), conn("c3")];
    rows.set(ontologyConcepts, [concept("k1"), concept("k2", "other")]);
    rows.set(ontologyConceptSides, [
      side("k1", "c1"),
      side("k1", "c2", "Q", "pid"),
      side("k2", "c3", "X", "x"), // an unrelated concept maps c3
    ]);
    await getGroundingModel(session, "c1");
    expect(reads.sort()).toEqual(["c1", "c2"]);
  });

  it("never shows a side on a connection the caller cannot use", async () => {
    rows.set(ontologyConcepts, [concept("k1")]);
    rows.set(ontologyConceptSides, [side("k1", "c1"), side("k1", "secret")]);
    const [c] = (await getGroundingModel(session, "c1"))?.concepts ?? [];
    expect(JSON.stringify(c)).not.toContain("secret");
  });
});

describe("getGroundingModel version and determinism", () => {
  const seed = (reverse: boolean) => {
    const order = <T>(a: T[]) => (reverse ? [...a].reverse() : a);
    rows.set(
      ontologyTerms,
      order([
        stored(entity("P"), { displayName: "Person" }),
        stored(prop("P", "id"), { displayName: "Id" }),
      ]),
    );
    rows.set(ontologyConcepts, order([concept("k1"), concept("k2", "b")]));
    rows.set(
      ontologyConceptSides,
      order([
        side("k1", "c1"),
        side("k1", "c1", "P", "name"),
        side("k1", "c2", "Q", "pid"),
        side("k1", "c2", "Q", "pname"),
        side("k1", "c3", "Q", "pid"),
        side("k2", "c1", "P", "name"),
      ]),
    );
    live.set("c1", order([entity("P"), prop("P", "id"), prop("P", "name")]));
    live.set("c2", [entity("Q"), prop("Q", "pid"), prop("Q", "pname")]);
    live.set("c3", [entity("Q"), prop("Q", "pid")]);
    usable = order([conn("c1"), conn("c2", "type-b"), conn("c3")]);
  };

  it("gives byte-identical JSON and one version whatever the read order", async () => {
    seed(false);
    const a = await getGroundingModel(session, "c1");
    seed(true);
    const b = await getGroundingModel(session, "c1");
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
    expect(a?.version).toMatch(/^[0-9a-f]{16}$/);
    // the inner lists are non-trivial, so a missing sort shows
    expect(a?.concepts[0].sides).toHaveLength(2);
    expect(a?.concepts[0].otherSides).toHaveLength(3);
  });

  it("changes the version when a display name changes", async () => {
    seed(false);
    const a = await getGroundingModel(session, "c1");
    rows.set(ontologyTerms, [
      stored(entity("P"), { displayName: "Human" }),
      stored(prop("P", "id"), { displayName: "Id" }),
    ]);
    expect((await getGroundingModel(session, "c1"))?.version).not.toBe(
      a?.version,
    );
  });

  it("changes the version when a concept field or another connection's name changes", async () => {
    seed(false);
    const v0 = (await getGroundingModel(session, "c1"))?.version;
    rows.set(ontologyConcepts, [
      { ...concept("k1"), description: "changed" },
      concept("k2", "b"),
    ]);
    const v1 = (await getGroundingModel(session, "c1"))?.version;
    expect(v1).not.toBe(v0);
    usable = [
      conn("c1"),
      { ...conn("c2", "type-b"), name: "renamed" },
      conn("c3"),
    ];
    expect((await getGroundingModel(session, "c1"))?.version).not.toBe(v1);
  });
});
