import { Neo4jRecordParser } from "../../../src/neo4j/Neo4jRecordParser";
import neo4j from "neo4j-driver";

const parser = new Neo4jRecordParser();
const parse = (value: unknown) =>
  parser._parse({ keys: ["c"], get: () => value } as any).c;

describe("Neo4jRecordParser - bytes and vectors (#2354)", () => {
  it.each([
    ["Int8Array", new Int8Array([1, 2, -1]), "\\x0102ff"],
    ["Uint8Array", new Uint8Array([1, 2, 255]), "\\x0102ff"],
    ["Buffer", Buffer.from([1, 2, 255]), "\\x0102ff"],
    ["empty", new Int8Array(), "\\x"],
  ])("a %s becomes a \\x hex string", (_n, value, expected) => {
    expect(parse(value)).toBe(expected);
  });

  it("a bytes property inside a node becomes hex", () => {
    const node = new neo4j.types.Node(
      neo4j.int(1),
      ["T"],
      { b: new Int8Array([1, 2, 3]) },
      "n:1",
    );
    const props = (parse(node) as any).properties;
    expect(props.b).toBe("\\x010203");
  });

  it.each([
    ["FLOAT32", new Float32Array([0.5, 1.5, 2.5]), [0.5, 1.5, 2.5]],
    ["FLOAT64", new Float64Array([0.1, 0.2]), [0.1, 0.2]],
    ["INT8", new Int8Array([1, -2]), [1, -2]],
    ["INT64", new BigInt64Array([1n, 2n]), [1, 2]],
  ])("a %s Vector becomes a plain list", (_n, typed, expected) => {
    expect(parse(neo4j.vector(typed as any))).toEqual(expected);
  });
});
