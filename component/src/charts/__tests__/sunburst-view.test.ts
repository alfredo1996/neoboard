import { describe, it, expect } from "vitest";
import { drillAfterClick, paintTree, sumValue, viewOf } from "../sunburst-view";
import { contrastRatio, mixColors } from "../chart-utils";
import { HASTINGS_DARK, HASTINGS_LIGHT, SURFACE_COLOR } from "../theme";

const tree = [
  {
    name: "Home",
    children: [
      {
        name: "Furniture",
        children: [
          { name: "Desk", value: 5 },
          { name: "Chair", value: 3 },
        ],
      },
      { name: "Decor", children: [{ name: "Rug", value: 2 }] },
    ],
  },
  { name: "Audio", children: [{ name: "Headphones", value: 4 }] },
];
const card = SURFACE_COLOR.light;
const painted = paintTree(tree, HASTINGS_LIGHT, card);

describe("paintTree", () => {
  it("gives each top category its own hue and its children lighter steps", () => {
    expect(painted[0].itemStyle.color).toBe("#C47C08");
    expect(painted[1].itemStyle.color).toBe("#5B7290");
    // Children step toward the card, the first lightest-but-one.
    expect(painted[0].children![0].itemStyle.color).toBe(
      mixColors("#C47C08", card, 0.3),
    );
    expect(painted[0].children![1].itemStyle.color).toBe(
      mixColors("#C47C08", card, 0.48),
    );
  });

  it("separates segments with a gap in the card colour", () => {
    expect(painted[0].itemStyle.borderColor).toBe(card);
  });

  it("takes ink or white per segment and reaches 4.5:1 on every one", () => {
    for (const [palette, c] of [
      [HASTINGS_LIGHT, SURFACE_COLOR.light],
      [HASTINGS_DARK, SURFACE_COLOR.dark],
    ] as const) {
      const walk = (nodes: ReturnType<typeof paintTree>) => {
        for (const n of nodes) {
          expect(
            contrastRatio(n.itemStyle.color, n.label.color),
          ).toBeGreaterThanOrEqual(4.5);
          if (n.children) walk(n.children);
        }
      };
      walk(paintTree(tree, palette, c));
    }
  });

  it("keeps the caller's extra keys on a node", () => {
    const out = paintTree(
      [{ name: "A", value: 1, properties: { id: 7 } } as never],
      HASTINGS_LIGHT,
      card,
    );
    expect((out[0] as unknown as { properties: unknown }).properties).toEqual({
      id: 7,
    });
  });
});

describe("viewOf", () => {
  const names = (nodes: { name: string }[]) => nodes.map((n) => n.name);
  const depthOf = (nodes: { children?: unknown[] }[]): number =>
    nodes.length
      ? 1 +
        Math.max(
          0,
          ...nodes.map((n) =>
            depthOf((n.children ?? []) as { children?: unknown[] }[]),
          ),
        )
      : 0;

  it("shows two rings first", () => {
    const v = viewOf(painted, [], 2);
    expect(names(v)).toEqual(["Home", "Audio"]);
    expect(depthOf(v)).toBe(2);
  });

  it("shows every ring when asked for none to be trimmed", () => {
    expect(depthOf(viewOf(painted, [], undefined))).toBe(3);
  });

  it("drilled into a category: its subcategories and their products", () => {
    const v = viewOf(painted, ["Home"], 2);
    expect(names(v)).toEqual(["Furniture", "Decor"]);
    expect(names(v[0].children!)).toEqual(["Desk", "Chair"]);
  });

  it("drilled into a subcategory: its products", () => {
    expect(names(viewOf(painted, ["Home", "Furniture"], 2))).toEqual([
      "Desk",
      "Chair",
    ]);
  });

  it("falls back to the overview when the drilled node is gone", () => {
    expect(names(viewOf(painted, ["Nope"], 2))).toEqual(["Home", "Audio"]);
  });

  it("keeps the colour a node had in the overview", () => {
    expect(viewOf(painted, ["Home"], 2)[0].itemStyle.color).toBe(
      painted[0].children![0].itemStyle.color,
    );
  });
});

describe("drillAfterClick", () => {
  it("a category goes one level down", () => {
    expect(drillAfterClick(painted, [], ["Home"])).toEqual(["Home"]);
  });

  it("a subcategory, clicked in the overview, shows its products", () => {
    expect(drillAfterClick(painted, [], ["Home", "Furniture"])).toEqual([
      "Home",
      "Furniture",
    ]);
  });

  it("paths are relative to the drilled node", () => {
    expect(drillAfterClick(painted, ["Home"], ["Furniture"])).toEqual([
      "Home",
      "Furniture",
    ]);
  });

  it("a product has nowhere to go: the drill stays", () => {
    expect(drillAfterClick(painted, ["Home", "Furniture"], ["Desk"])).toEqual([
      "Home",
      "Furniture",
    ]);
  });
});

describe("sumValue", () => {
  it("adds leaves, and a parent without a value is its children's sum", () => {
    expect(sumValue(painted)).toBe(14);
  });

  it("a parent's own value wins when it is larger", () => {
    expect(
      sumValue([{ name: "P", value: 20, children: [{ name: "c", value: 5 }] }]),
    ).toBe(20);
  });
});
