import { describe, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { users } from "@/lib/db/schema";
import {
  makeSelectChain,
  makeUpdateChain,
  makeInsertChain,
  sqlColumns,
  sqlValues,
} from "../drizzle-mocks";

/**
 * The shared chain used to throw its arguments away (`where: () => c`), so a
 * route that forgot its tenant filter returned the same rows and every test
 * still passed. CLAUDE.md is explicit that a missing filter is a cross-tenant
 * leak the ORM will not catch (#1607).
 */
describe("query-chain stubs record what the handler passed", () => {
  it("records the where expression on a select", async () => {
    const chain = makeSelectChain([{ id: "1" }]);
    chain.from({}).where(eq(users.tenantId, "tenant-a"));
    expect(chain.calls.where).toHaveLength(1);
  });

  it("records set and where on an update", async () => {
    const chain = makeUpdateChain([]);
    chain.set({ name: "x" }).where(eq(users.id, "u1"));
    expect(chain.calls.set[0]).toEqual([{ name: "x" }]);
    expect(chain.calls.where).toHaveLength(1);
  });

  it("records the values passed to an insert", () => {
    const chain = makeInsertChain([]);
    chain.values({ id: "u1", tenantId: "t1" });
    expect(chain.calls.values[0]).toEqual([{ id: "u1", tenantId: "t1" }]);
  });

  it("still resolves to its rows, so existing tests keep working", async () => {
    const rows = [{ id: "1" }];
    await expect(
      makeSelectChain(rows).from({}).where(undefined),
    ).resolves.toEqual(rows);
  });
});

/**
 * A recorded expression is only useful if a test can look inside it. Drizzle
 * builds a nested `queryChunks` tree: column references carry a `name`, bound
 * values carry an `encoder`.
 */
describe("reading a recorded where expression", () => {
  it("names every column the filter touches", () => {
    const expr = and(eq(users.tenantId, "t1"), eq(users.email, "a@b.c"));
    expect(sqlColumns(expr)).toEqual(
      expect.arrayContaining(["tenant_id", "email"]),
    );
  });

  it("returns the bound values, so a test can assert the tenant is the session's", () => {
    const expr = and(eq(users.tenantId, "tenant-x"), eq(users.id, "u-9"));
    expect(sqlValues(expr)).toEqual(
      expect.arrayContaining(["tenant-x", "u-9"]),
    );
  });

  it("finds a tenant filter nested inside an and()", () => {
    const expr = and(eq(users.id, "u1"), and(eq(users.tenantId, "t2")));
    expect(sqlColumns(expr)).toContain("tenant_id");
    expect(sqlValues(expr)).toContain("t2");
  });

  it("reports nothing for an absent filter rather than throwing", () => {
    expect(sqlColumns(undefined)).toEqual([]);
    expect(sqlValues(null)).toEqual([]);
  });
});
