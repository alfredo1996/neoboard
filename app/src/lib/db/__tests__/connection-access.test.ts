import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import {
  makeSelectChain,
  sqlColumns,
  sqlValues,
} from "@/__tests__/helpers/drizzle-mocks";

const { mockSelect } = vi.hoisted(() => ({ mockSelect: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { select: mockSelect } }));

import {
  layoutConnectionIds,
  unusableByOwner,
  unusableConnectionIds,
  usableConnection,
} from "../connection-access";

const CREATOR = { userId: "user-1", tenantId: "t1", role: "creator" as const };

describe("layoutConnectionIds", () => {
  it("collects each widget's connection once, across pages", () => {
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "One",
          widgets: [
            { id: "w1", connectionId: "c1" },
            { id: "w2", connectionId: "c2" },
          ],
          gridLayout: [],
        },
        {
          id: "p2",
          title: "Two",
          widgets: [{ id: "w3", connectionId: "c1" }],
          gridLayout: [],
        },
      ],
    };
    expect([...layoutConnectionIds(layout)].sort()).toEqual(["c1", "c2"]);
  });

  it("skips widgets without a connection, like markdown", () => {
    const layout = {
      version: 2,
      pages: [
        {
          id: "p1",
          title: "One",
          widgets: [{ id: "w1", connectionId: "" }, { id: "w2" }],
          gridLayout: [],
        },
      ],
    };
    expect(layoutConnectionIds(layout).size).toBe(0);
  });

  it("reads a legacy v1 layout and an empty one", () => {
    const v1 = { widgets: [{ id: "w1", connectionId: "c9" }], gridLayout: [] };
    expect([...layoutConnectionIds(v1)]).toEqual(["c9"]);
    expect(layoutConnectionIds(null).size).toBe(0);
  });
});

describe("usableConnection", () => {
  it.each(["creator", "reader"] as const)(
    "is the caller's own connection or a shared one for a %s (#901)",
    (role) => {
      const expr = usableConnection("user-1", role);
      expect(sqlColumns(expr)).toEqual(["userId", "visibility"]);
      expect(sqlValues(expr)).toEqual(["user-1", "shared"]);
    },
  );

  it("puts no restriction on an admin", () => {
    expect(usableConnection("admin-1", "admin")).toBeUndefined();
  });
});

describe("unusableConnectionIds", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("returns the tenant's connections among the ids that are neither the caller's nor shared (#1816)", async () => {
    const lookup = makeSelectChain([{ id: "c-private" }]);
    mockSelect.mockReturnValueOnce(lookup);

    const denied = await unusableConnectionIds(
      ["c-private", "c-own", "c-private"],
      CREATOR,
    );

    expect(denied).toEqual(["c-private"]);
    expect(lookup.calls.where).toHaveLength(1);
    const [expr] = lookup.calls.where[0] as [SQL];
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["tenant_id", "id", "userId", "visibility"]),
    );
    // Session tenant, each id once, then the owner-or-shared rule.
    expect(sqlValues(expr)).toEqual([
      "t1",
      "c-private",
      "c-own",
      "user-1",
      "shared",
    ]);
    // Negated: it selects what the caller may NOT use, so an id that matches
    // no connection is never reported.
    expect(new PgDialect().sqlToQuery(expr).sql).toMatch(/\bnot \(/i);
  });

  it("asks nothing for an admin, who may use any connection in the tenant", async () => {
    expect(
      await unusableConnectionIds(["c-any"], { ...CREATOR, role: "admin" }),
    ).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });

  it("asks nothing when there is no connection to check", async () => {
    expect(await unusableConnectionIds([], CREATOR)).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});

describe("unusableByOwner", () => {
  beforeEach(() => {
    mockSelect.mockReset();
  });

  it("reads the dashboard owner's current role in the tenant, then applies the rule for them (#1816)", async () => {
    const owner = makeSelectChain([{ role: "creator" }]);
    const lookup = makeSelectChain([{ id: "c-alice" }]);
    mockSelect.mockReturnValueOnce(owner).mockReturnValueOnce(lookup);

    expect(await unusableByOwner(["c-alice"], "bob", "t1")).toEqual([
      "c-alice",
    ]);

    const [who] = owner.calls.where[0] as [SQL];
    expect(sqlColumns(who)).toEqual(["id", "tenant_id"]);
    expect(sqlValues(who)).toEqual(["bob", "t1"]);
    const [expr] = lookup.calls.where[0] as [SQL];
    expect(sqlValues(expr)).toEqual(["t1", "c-alice", "bob", "shared"]);
  });

  it("finds nothing an admin owner cannot use", async () => {
    mockSelect.mockReturnValueOnce(makeSelectChain([{ role: "admin" }]));
    expect(await unusableByOwner(["c-any"], "alice", "t1")).toEqual([]);
    expect(mockSelect).toHaveBeenCalledTimes(1);
  });

  it("asks nothing when there is no connection to check", async () => {
    expect(await unusableByOwner([], "bob", "t1")).toEqual([]);
    expect(mockSelect).not.toHaveBeenCalled();
  });
});
