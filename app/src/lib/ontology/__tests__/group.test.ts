import { describe, it, expect } from "vitest";
import { groupTerms } from "../group";
import type { OntologyTerm } from "../merge";

const term = (over: Partial<OntologyTerm>): OntologyTerm => ({
  kind: "entity",
  key: "Person",
  parentKey: "",
  displayName: "",
  description: "",
  hidden: false,
  orphaned: false,
  ...over,
});

const TERMS: OntologyTerm[] = [
  term({ key: "Person" }),
  term({ kind: "property", key: "email", parentKey: "entity:Person" }),
  term({ kind: "relationship", key: "KNOWS" }),
  term({ kind: "property", key: "email", parentKey: "relationship:KNOWS" }),
  term({ key: "Movie", description: "A film" }),
];

const heads = (g: ReturnType<typeof groupTerms>) =>
  g.map((x) => `${x.head.kind}:${x.head.key}/${x.properties.length}`);

describe("groupTerms", () => {
  it("lists entities, then relationships, each with its own properties", () => {
    expect(heads(groupTerms(TERMS, "", true))).toEqual([
      "entity:Person/1",
      "entity:Movie/0",
      "relationship:KNOWS/1",
    ]);
  });

  it("keeps a group whole when any of its terms matches the search", () => {
    const out = groupTerms(TERMS, "EMAIL", true);
    expect(heads(out)).toEqual(["entity:Person/1", "relationship:KNOWS/1"]);
  });

  it("searches the display name and description too", () => {
    expect(heads(groupTerms(TERMS, "film", true))).toEqual(["entity:Movie/0"]);
  });

  it("leaves hidden terms out unless asked, and a hidden entity takes its properties", () => {
    const withHidden = [
      term({ key: "Person", hidden: true }),
      term({ kind: "property", key: "email", parentKey: "entity:Person" }),
      term({ key: "Movie" }),
      term({
        kind: "property",
        key: "title",
        parentKey: "entity:Movie",
        hidden: true,
      }),
    ];
    expect(heads(groupTerms(withHidden, "", false))).toEqual([
      "entity:Movie/0",
    ]);
    expect(heads(groupTerms(withHidden, "", true))).toEqual([
      "entity:Person/1",
      "entity:Movie/1",
    ]);
  });

  it("shows a stored property whose parent is gone as a row of its own", () => {
    const orphans = [
      term({
        kind: "property",
        key: "age",
        parentKey: "entity:Gone",
        orphaned: true,
      }),
    ];
    expect(heads(groupTerms(orphans, "", true))).toEqual(["property:age/0"]);
  });
});
