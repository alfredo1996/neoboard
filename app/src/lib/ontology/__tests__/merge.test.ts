import { describe, it, expect } from "vitest";
import type { SchemaTerm } from "@neoboard/connection";
import { mergeTerms, type StoredTerm } from "../merge";

const live: SchemaTerm[] = [
  { kind: "entity", key: "Person", parentKey: "" },
  { kind: "property", key: "name", parentKey: "entity:Person", type: "String" },
  { kind: "relationship", key: "KNOWS", parentKey: "" },
  { kind: "property", key: "name", parentKey: "relationship:KNOWS", type: "X" },
];

const stored = (over: Partial<StoredTerm>): StoredTerm => ({
  kind: "entity",
  key: "Person",
  parentKey: "",
  displayName: "",
  description: "",
  hidden: false,
  ...over,
});

describe("mergeTerms", () => {
  it("gives every live term empty meaning when nothing is stored", () => {
    expect(mergeTerms(live, [])[0]).toEqual({
      kind: "entity",
      key: "Person",
      parentKey: "",
      displayName: "",
      description: "",
      hidden: false,
      orphaned: false,
    });
  });

  it("lays stored meaning over the matching term and keeps the structure fields", () => {
    const merged = mergeTerms(live, [
      stored({
        kind: "property",
        key: "name",
        parentKey: "entity:Person",
        displayName: "Full name",
        description: "As on the passport",
        hidden: true,
      }),
    ]);
    expect(merged[1]).toEqual({
      kind: "property",
      key: "name",
      parentKey: "entity:Person",
      type: "String",
      displayName: "Full name",
      description: "As on the passport",
      hidden: true,
      orphaned: false,
    });
  });

  it("does not hand a property's meaning to a same-named property of another parent", () => {
    const merged = mergeTerms(live, [
      stored({
        kind: "property",
        key: "name",
        parentKey: "entity:Person",
        description: "person's",
      }),
    ]);
    expect(merged[3].description).toBe("");
  });

  it("flags a stored term the live structure no longer reports, keeping its meaning", () => {
    const merged = mergeTerms(live, [
      stored({ key: "Gone", description: "was here" }),
    ]);
    expect(merged).toHaveLength(live.length + 1);
    expect(merged.at(-1)).toEqual({
      kind: "entity",
      key: "Gone",
      parentKey: "",
      displayName: "",
      description: "was here",
      hidden: false,
      orphaned: true,
    });
  });
});
