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

  it("lets the node's id and labels win over a property of the same name", () => {
    const p = graphNodeClickPayload(node({ nodeId: "x", labels: "y" }));
    expect(p.nodeId).toBe("4:db:1");
    expect(p.labels).toEqual(["Person"]);
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

  it("lists nodeId, labels and the property keys of every node, once", () => {
    const fields = graphClickFields([
      tagged({ email: "a", name: "A" }, 1),
      tagged({ email: "b", age: 2, nodeId: "z" }, 2),
    ]);
    expect(fields).toEqual(["nodeId", "labels", "email", "name", "age"]);
  });

  it("does not offer the result column holding the node", () => {
    expect(graphClickFields([tagged({ email: "a" }, 1)])).not.toContain("p");
  });
});
