import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  GraphInspector,
  type GraphInspectorProps,
  type InspectorElement,
} from "../graph-inspector";

type NodeEl = Extract<InspectorElement, { kind: "node" }>;
type RelEl = Extract<InspectorElement, { kind: "relationship" }>;

const node: NodeEl = {
  kind: "node",
  id: "n1",
  title: "The Matrix",
  color: "#3366cc",
  labels: ["Movie"],
  properties: [
    { key: "title", value: "The Matrix" },
    { key: "released", value: 1999 },
    { key: "budget", value: 63000000 },
    { key: "tagline", value: null },
  ],
};

const rel: RelEl = {
  kind: "relationship",
  id: "r1",
  title: "REVIEWED",
  source: { id: "p1", name: "Jessica Thompson" },
  target: { id: "n1", name: "The Matrix" },
  siblings: ["r1", "r2"],
  properties: [{ key: "rating", value: 95 }],
};

function setup(over: Partial<GraphInspectorProps> = {}) {
  const props: GraphInspectorProps = {
    element: node,
    elementJson: '{"kind":"node"}',
    side: "right",
    width: 300,
    onClose: vi.fn(),
    onSelectNode: vi.fn(),
    onSelectRelationship: vi.fn(),
    onCopied: vi.fn(),
    onCopyBlocked: vi.fn(),
    ...over,
  };
  render(<GraphInspector {...props} />);
  return props;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GraphInspector header", () => {
  it("names a node region and shows its caption, dot and labels", () => {
    setup();
    const region = screen.getByRole("region", { name: "Node: The Matrix" });
    expect(
      within(region).getByRole("heading", { name: "The Matrix" }),
    ).toBeInTheDocument();
    expect(within(region).getByText("Movie")).toBeInTheDocument();
    expect(within(region).getByTestId("graph-inspector-dot")).toHaveStyle({
      backgroundColor: "#3366cc",
    });
  });

  it("shows every label of a multi-label node as its own tag", () => {
    setup({
      element: { ...node, labels: ["Person", "Actor", "Director"] },
    });
    for (const l of ["Person", "Actor", "Director"]) {
      expect(screen.getByText(l)).toBeInTheDocument();
    }
  });

  it("shows a relationship's type and both ends as links that select them", async () => {
    const user = userEvent.setup();
    const p = setup({ element: rel });
    expect(
      screen.getByRole("region", { name: "Relationship: REVIEWED" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Jessica Thompson" }));
    expect(p.onSelectNode).toHaveBeenCalledWith("p1");
    await user.click(screen.getByRole("button", { name: "The Matrix" }));
    expect(p.onSelectNode).toHaveBeenLastCalledWith("n1");
  });

  it("closes from the Close button", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Close inspector" }));
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus to the title on open", () => {
    setup();
    expect(screen.getByRole("heading", { name: "The Matrix" })).toHaveFocus();
  });

  it("closes on Escape from inside the panel", async () => {
    const user = userEvent.setup();
    const p = setup();
    await user.keyboard("{Escape}");
    expect(p.onClose).toHaveBeenCalledTimes(1);
  });

  it("takes the chosen side and width", () => {
    setup({ side: "left", width: 263 });
    const panel = screen.getByTestId("graph-inspector");
    expect(panel).toHaveAttribute("data-side", "left");
    expect(panel).toHaveStyle({ width: "263px" });
  });
});

describe("GraphInspector stepper", () => {
  it("says which of the parallel relationships this is", () => {
    setup({ element: rel });
    expect(screen.getByText("1 of 2 between these nodes")).toBeInTheDocument();
  });

  it("steps to the next and previous sibling, wrapping at the ends", async () => {
    const user = userEvent.setup();
    const p = setup({ element: rel });
    await user.click(
      screen.getByRole("button", {
        name: "Next relationship between these nodes",
      }),
    );
    expect(p.onSelectRelationship).toHaveBeenCalledWith("r2");
    await user.click(
      screen.getByRole("button", {
        name: "Previous relationship between these nodes",
      }),
    );
    expect(p.onSelectRelationship).toHaveBeenLastCalledWith("r2");
  });

  it("shows no stepper for a relationship with no sibling", () => {
    setup({ element: { ...rel, siblings: ["r1"] } });
    expect(screen.queryByText(/between these nodes/)).toBeNull();
  });
});

describe("GraphInspector properties", () => {
  it("lists properties sorted with grouping on large numbers and bare years", () => {
    setup();
    const rows = screen.getAllByTestId("property-row");
    const text = rows.map((r) => r.textContent);
    expect(text[0]).toContain("budget");
    expect(text[0]).toContain("63,000,000");
    expect(text.find((t) => t?.includes("released"))).toContain("1999");
    expect(screen.getByText("null")).toBeInTheDocument();
  });

  it("says so when there are no properties", () => {
    setup({ element: { ...node, properties: [] } });
    expect(screen.getByText("No properties.")).toBeInTheDocument();
  });

  it("renders lists, maps and long text", () => {
    setup({
      element: {
        ...node,
        properties: [
          { key: "genres", value: ["a", "b"] },
          { key: "geo", value: { lat: 1, lon: 2 } },
          { key: "plot", value: "z".repeat(400) },
        ],
      },
    });
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("lat:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Show more" }),
    ).toBeInTheDocument();
  });

  it("shows the element id at the bottom", () => {
    setup();
    expect(screen.getByTestId("graph-inspector-id")).toHaveTextContent("n1");
  });
});

describe("GraphInspector copy", () => {
  it("Copy writes the element JSON and reports it", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Copy node as JSON" }));
    expect(write).toHaveBeenCalledWith('{"kind":"node"}');
    await waitFor(() =>
      expect(p.onCopied).toHaveBeenCalledWith("the node as JSON"),
    );
  });

  it("copies a property's raw value, a map as JSON", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    setup({
      element: {
        ...node,
        properties: [
          { key: "budget", value: 63000000 },
          { key: "geo", value: { lat: 1 } },
        ],
      },
    });
    await user.click(screen.getByRole("button", { name: "Copy budget" }));
    expect(write).toHaveBeenLastCalledWith("63000000");
    await user.click(screen.getByRole("button", { name: "Copy geo" }));
    expect(write).toHaveBeenLastCalledWith('{"lat":1}');
  });

  it("copies the element id", async () => {
    const user = userEvent.setup();
    const write = vi.spyOn(navigator.clipboard, "writeText");
    setup();
    await user.click(screen.getByRole("button", { name: "Copy element id" }));
    expect(write).toHaveBeenCalledWith("n1");
  });

  it("when the browser blocks the clipboard, shows the JSON selected in a box", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Copy node as JSON" }));
    const box = await screen.findByRole("textbox", { name: "Text to copy" });
    expect(box).toHaveValue('{"kind":"node"}');
    expect(box).toHaveFocus();
    expect((box as HTMLTextAreaElement).selectionEnd).toBe(15);
    expect(p.onCopyBlocked).toHaveBeenCalledTimes(1);
    expect(p.onCopied).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

describe("GraphInspector connections", () => {
  const conns = [
    {
      id: "c1",
      type: "ACTED_IN",
      direction: "from" as const,
      otherId: "p1",
      otherName: "Keanu",
    },
    {
      id: "c2",
      type: "ACTED_IN",
      direction: "from" as const,
      otherId: "p2",
      otherName: "Carrie",
    },
    {
      id: "c3",
      type: "REVIEWED",
      direction: "from" as const,
      otherId: "p3",
      otherName: "Jessica",
    },
    {
      id: "c4",
      type: "REVIEWED",
      direction: "from" as const,
      otherId: "p3",
      otherName: "Jessica",
    },
    {
      id: "c5",
      type: "DIRECTED",
      direction: "to" as const,
      otherId: "p4",
      otherName: "Lana",
    },
  ];

  it("groups by type and direction and counts them", () => {
    setup({ connections: conns });
    expect(screen.getByText("5 on this graph")).toBeInTheDocument();
    const groups = screen.getAllByTestId("connection-group");
    expect(groups.map((g) => g.getAttribute("data-group"))).toEqual([
      "ACTED_IN|from",
      "DIRECTED|to",
      "REVIEWED|from",
    ]);
  });

  it("marks parallel relationships to the same node as 1 of 2", () => {
    setup({ connections: conns });
    const reviewed = screen
      .getAllByTestId("connection-group")
      .find((g) => g.getAttribute("data-group") === "REVIEWED|from")!;
    const rows = within(reviewed).getAllByRole("button");
    expect(rows[0]).toHaveAccessibleName("REVIEWED from Jessica, 1 of 2");
    expect(rows[1]).toHaveAccessibleName("REVIEWED from Jessica, 2 of 2");
    const acted = screen
      .getAllByTestId("connection-group")
      .find((g) => g.getAttribute("data-group") === "ACTED_IN|from")!;
    expect(within(acted).queryByText(/of 2/)).toBeNull();
  });

  it("opens the relationship a row names", async () => {
    const user = userEvent.setup();
    const p = setup({ connections: conns });
    await user.click(
      screen.getByRole("button", { name: "REVIEWED from Jessica, 2 of 2" }),
    );
    expect(p.onSelectRelationship).toHaveBeenCalledWith("c4");
  });

  it("shows five per group, then +N more", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`,
      type: "KNOWS",
      direction: "to" as const,
      otherId: `o${i}`,
      otherName: `Person ${i}`,
    }));
    setup({ connections: many });
    const group = screen.getByTestId("connection-group");
    expect(
      within(group).getAllByRole("button", { name: /^KNOWS/ }),
    ).toHaveLength(5);
    await user.click(within(group).getByRole("button", { name: "+2 more" }));
    expect(
      within(group).getAllByRole("button", { name: /^KNOWS/ }),
    ).toHaveLength(7);
  });

  it("says when a node has none, and shows nothing on a relationship", () => {
    setup({ connections: [] });
    expect(screen.getByText("None on this graph.")).toBeInTheDocument();
  });

  it("has no Connections section on a relationship", () => {
    setup({ element: rel, connections: conns });
    expect(screen.queryByText("Connections")).toBeNull();
  });
});
