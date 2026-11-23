import { describe, it, expect } from "vitest";
import { graphNodeClickPayload, graphClickFields } from "../click-payload";

const node = (properties: Record<string, unknown>) => ({
  id: "4:db:1",
  labels: ["Person"],
  properties,
});

describe("graphNodeClickPayload (#2526)", () => {
  it("carries the id, the labels and every property", () => {
    expect(graphNodeClickPayload(node({ email: "a@b.c", age: 3 }))).toEqual({
      email: "a@b.c",
      age: 3,
      nodeId: "4:db:1",
      labels: ["Person"],
    });
  });

  it("lets a stored property win over the id and labels of the same name", () => {
    const p = graphNodeClickPayload(node({ nodeId: "x", labels: "y" }));
    expect(p.nodeId).toBe("x");
    expect(p.labels).toBe("y");
  });

  it("falls back to empty labels and no properties", () => {
    expect(graphNodeClickPayload({ id: "n" } as never)).toEqual({
      nodeId: "n",
      labels: [],
    });
  });

  it("drops the click-resolution control keys", () => {
    const p = graphNodeClickPayload(
      node({ _clickedValue: 1, _clickedColumn: "c", ok: 1 }),
    );
    expect("_clickedValue" in p).toBe(false);
    expect("_clickedColumn" in p).toBe(false);
    expect(p.ok).toBe(1);
  });
});

describe("graphClickFields (#2526)", () => {
  const tagged = (properties: Record<string, unknown>, id: number) => ({
    p: { $type: "node", elementId: String(id), labels: ["Person"], properties },
  });

  it("lists the property keys of every node, once, and not nodeId or labels", () => {
    const fields = graphClickFields([
      tagged({ email: "a", name: "A" }, 1),
      tagged({ email: "b", age: 2, nodeId: "z" }, 2),
    ]);
    expect(fields).toEqual(["email", "name", "age", "nodeId"]);
    expect(fields).not.toContain("labels");
  });

  it("omits a key whose every value is a list or a map, since a click sets nothing from it", () => {
    const fields = graphClickFields([
      tagged({ tags: ["a"], meta: { k: 1 }, name: "A" }, 1),
      tagged({ tags: ["b"], name: "B" }, 2),
    ]);
    expect(fields).toEqual(["name"]);
  });

  it("keeps a key that is a scalar on at least one node, and omits control keys", () => {
    const fields = graphClickFields([
      tagged({ x: ["a"], _clickedValue: 1 }, 1),
      tagged({ x: 5 }, 2),
    ]);
    expect(fields).toEqual(["x"]);
  });

  it("is empty when the data holds no node", () => {
    expect(graphClickFields([{ a: 1 }])).toEqual([]);
  });

  it("does not offer the result column holding the node", () => {
    expect(graphClickFields([tagged({ email: "a" }, 1)])).not.toContain("p");
  });
});
