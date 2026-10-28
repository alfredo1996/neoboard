/**
 * The inspector's sections keep a property's structure (#2349): a list stays a
 * list and a map stays a map, so the panel can render them, never a JSON string.
 */
import { describe, it, expect, vi } from "vitest";

vi.mock("@neoboard/components", () => ({ GraphChart: () => null }));

import { nodeToSections, edgeToSections } from "../graph-exploration-wrapper";

const props = {
  names: ["a", "b"],
  point: { srid: 4326, x: 1.5, y: 2.5 },
  big: "9007199254740993",
  n: 3,
  flag: false,
  gone: null,
};

describe("nodeToSections / edgeToSections", () => {
  it("nodeToSections hands lists and maps over as structure", () => {
    const [, properties] = nodeToSections({
      id: "4:abc:1",
      labels: ["Company"],
      properties: props,
    } as never);
    expect(properties.items).toEqual(
      Object.entries(props).map(([key, value]) => ({ key, value })),
    );
  });

  it("edgeToSections hands lists and maps over as structure", () => {
    const [, properties] = edgeToSections({
      id: "e1",
      source: "a",
      target: "b",
      label: "OWNS",
      properties: props,
    } as never);
    expect(properties.items).toEqual(
      Object.entries(props).map(([key, value]) => ({ key, value })),
    );
  });
});
