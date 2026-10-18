import { describe, it, expect } from "vitest";
import {
  USER_PAGE_SIZE,
  nextSort,
  pageCount,
  pageOf,
  sortUsers,
  userListMeta,
  userStatusFilters,
  type UserSort,
} from "../user-list";
import type { UserListItem } from "@/hooks/use-users";

function user(over: Partial<UserListItem> & { id: string }): UserListItem {
  return {
    name: over.id,
    email: `${over.id}@example.com`,
    role: "creator",
    canWrite: true,
    disabledAt: null,
    createdAt: "2026-10-01T00:00:00Z",
    ...over,
  };
}

const ALICE = user({
  id: "alice",
  role: "admin",
  createdAt: "2026-10-02T00:00:00Z",
});
const BOB = user({ id: "bob", createdAt: "2026-10-04T00:00:00Z" });
const CAROL = user({
  id: "carol",
  role: "reader",
  canWrite: false,
  createdAt: "2026-10-09T00:00:00Z",
});
const DAN = user({
  id: "dan",
  role: "reader",
  canWrite: false,
  disabledAt: "2026-10-10T00:00:00Z",
  createdAt: "2026-09-01T00:00:00Z",
});
const ALL = [ALICE, BOB, CAROL, DAN];
const ids = (list: UserListItem[]) => list.map((u) => u.id);

describe("userListMeta", () => {
  it.each([
    [ALL, "4 people · 1 disabled"],
    [[ALICE, BOB], "2 people"],
    [[ALICE], "1 person"],
    [[DAN], "1 person · 1 disabled"],
  ])("%j reads %s", (list, expected) => {
    expect(userListMeta(list)).toBe(expected);
  });
});

describe("userStatusFilters", () => {
  it("shows no chip for all users, one for a narrowed status", () => {
    expect(userStatusFilters("all")).toEqual([]);
    expect(userStatusFilters("disabled")).toEqual([
      { id: "status", label: "Status", value: "disabled" },
    ]);
  });
});

describe("sortUsers", () => {
  const sorted = (sort: UserSort) => ids(sortUsers(ALL, sort));

  it.each([
    [
      { column: "Name", direction: "ascending" },
      ["alice", "bob", "carol", "dan"],
    ],
    [
      { column: "Name", direction: "descending" },
      ["dan", "carol", "bob", "alice"],
    ],
    [
      { column: "Created", direction: "descending" },
      ["carol", "bob", "alice", "dan"],
    ],
    [
      { column: "Created", direction: "ascending" },
      ["dan", "alice", "bob", "carol"],
    ],
    // Admin before creator before reader; ties keep the list's order.
    [
      { column: "Role", direction: "ascending" },
      ["alice", "bob", "carol", "dan"],
    ],
    [
      { column: "Write", direction: "descending" },
      ["carol", "dan", "alice", "bob"],
    ],
    [
      { column: "Status", direction: "descending" },
      ["dan", "alice", "bob", "carol"],
    ],
  ] as [UserSort, string[]][])("%j", (sort, expected) => {
    expect(sorted(sort)).toEqual(expected);
  });

  it("does not reorder the list it was given", () => {
    sortUsers(ALL, { column: "Name", direction: "descending" });
    expect(ids(ALL)).toEqual(["alice", "bob", "carol", "dan"]);
  });

  it("sorts a user with no name by their email, and last when they have neither", () => {
    const anon = user({ id: "x", name: null, email: "zed@example.com" });
    const none = user({ id: "y", name: null, email: null });
    expect(
      ids(
        sortUsers([none, anon, ALICE], {
          column: "Name",
          direction: "ascending",
        }),
      ),
    ).toEqual(["alice", "x", "y"]);
  });
});

describe("nextSort", () => {
  it("starts a new column ascending and flips the same column", () => {
    const created: UserSort = { column: "Created", direction: "descending" };
    expect(nextSort(created, "Name")).toEqual({
      column: "Name",
      direction: "ascending",
    });
    expect(
      nextSort({ column: "Name", direction: "ascending" }, "Name"),
    ).toEqual({
      column: "Name",
      direction: "descending",
    });
  });
});

describe("paging", () => {
  const many = Array.from({ length: 45 }, (_, i) => i);

  it("takes 20 to a page", () => {
    expect(USER_PAGE_SIZE).toBe(20);
    expect(pageOf(many, 0)).toHaveLength(20);
    expect(pageOf(many, 2)).toEqual([40, 41, 42, 43, 44]);
  });

  it("counts pages, at least one", () => {
    expect(pageCount(45)).toBe(3);
    expect(pageCount(20)).toBe(1);
    expect(pageCount(0)).toBe(1);
  });
});
