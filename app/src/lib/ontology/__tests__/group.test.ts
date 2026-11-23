import { describe, it, expect } from "vitest";
import { buildGroups, filterGroups } from "../group";
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

const groupTerms = (t: OntologyTerm[], q: string, show: boolean) =>
  filterGroups(buildGroups(t), q, show);

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

// The O(heads x properties) grouping #2533 replaced, kept as the reference.
const KIND_ORDER = ["entity", "relationship"];
const rank = (g: { head: OntologyTerm }) => {
  const i = KIND_ORDER.indexOf(g.head.kind);
  return i === -1 ? KIND_ORDER.length : i;
};
function legacy(terms: OntologyTerm[], search: string, showHidden: boolean) {
  const q = search.trim().toLowerCase();
  const visible = terms.filter((t) => showHidden || !t.hidden);
  const headIds = new Set(
    visible
      .filter((t) => t.kind !== "property")
      .map((t) => `${t.kind}:${t.key}`),
  );
  const all = new Set(terms.map((t) => `${t.kind}:${t.key}`));
  const isChild = (t: OntologyTerm) =>
    t.kind === "property" && headIds.has(t.parentKey);
  const m = (t: OntologyTerm) =>
    [t.key, t.displayName, t.description].some((x) =>
      x.toLowerCase().includes(q),
    );
  return visible
    .filter(
      (t) => !isChild(t) && !(t.kind === "property" && all.has(t.parentKey)),
    )
    .map((head) => ({
      head,
      properties: visible.filter(
        (p) => isChild(p) && p.parentKey === `${head.kind}:${head.key}`,
      ),
    }))
    .filter((g) => !q || [g.head, ...g.properties].some(m))
    .sort((a, b) => rank(a) - rank(b));
}

describe("buildGroups and filterGroups (#2533)", () => {
  const mixed = [
    term({
      kind: "property",
      key: "early",
      parentKey: "entity:Lost",
      orphaned: true,
    }),
    ...TERMS,
    term({ key: "Secret", hidden: true }),
    term({ kind: "property", key: "pin", parentKey: "entity:Secret" }),
    term({
      kind: "property",
      key: "age",
      parentKey: "entity:Person",
      hidden: true,
    }),
    term({
      kind: "property",
      key: "stray",
      parentKey: "entity:Gone",
      orphaned: true,
    }),
    term({
      kind: "property",
      key: "hiddenstray",
      parentKey: "entity:Gone",
      hidden: true,
    }),
  ];

  it.each([
    ["", false],
    ["", true],
    ["email", false],
    ["PIN", true],
    ["pin", false],
    ["film", true],
    ["stray", false],
    ["nothing", true],
  ])(
    "lists the same groups as before for search %j, showHidden %s",
    (q, show) => {
      expect(filterGroups(buildGroups(mixed), q, show)).toEqual(
        legacy(mixed, q, show),
      );
    },
  );

  it("groups 2,000 entities of 25 properties in one pass", () => {
    const big: OntologyTerm[] = [];
    for (let i = 0; i < 2000; i++) {
      big.push(term({ key: `t${i}` }));
      for (let j = 0; j < 25; j++) {
        big.push(
          term({ kind: "property", key: `c${j}`, parentKey: `entity:t${i}` }),
        );
      }
    }
    const before = process.cpuUsage();
    const groups = buildGroups(big);
    const { user, system } = process.cpuUsage(before);
    expect(groups).toHaveLength(2000);
    expect(groups[1999].properties).toHaveLength(25);
    // 100 million comparisons took seconds; one pass takes a few ms.
    expect((user + system) / 1000).toBeLessThan(200);
  });
});
