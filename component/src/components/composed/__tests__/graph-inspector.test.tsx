import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, it, expect, vi } from "vitest";
import {
  GraphInspector,
  graphInspectorWidth,
  type GraphInspectorProps,
  type InspectorElement,
} from "../graph-inspector";

type NodeEl = Extract<InspectorElement, { kind: "node" }>;
type RelEl = Extract<InspectorElement, { kind: "relationship" }>;

const node: NodeEl = {
  kind: "node",
  id: "n1",
  databaseId: "n1",
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
  databaseId: "r1",
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
  const view = render(<GraphInspector {...props} />);
  return {
    ...props,
    /** The parent hands the panel another element, as a step or a select does. */
    rerender: (over: Partial<GraphInspectorProps>) =>
      view.rerender(<GraphInspector {...props} {...over} />),
  };
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

  it("steps to the next and to the previous sibling, wrapping at the ends", async () => {
    const user = userEvent.setup();
    const p = setup({ element: { ...rel, siblings: ["r1", "r2", "r3"] } });
    await user.click(
      screen.getByRole("button", {
        name: "Next relationship between these nodes",
      }),
    );
    expect(p.onSelectRelationship).toHaveBeenLastCalledWith("r2");
    await user.click(
      screen.getByRole("button", {
        name: "Previous relationship between these nodes",
      }),
    );
    expect(p.onSelectRelationship).toHaveBeenLastCalledWith("r3");
  });

  it("keeps focus on the arrow after a step, and moves it to the title on a select", async () => {
    const user = userEvent.setup();
    const p = setup({ element: rel });
    const next = screen.getByRole("button", {
      name: "Next relationship between these nodes",
    });
    await user.click(next);
    p.rerender({ element: { ...rel, id: "r2" } });
    expect(next).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "The Matrix" }));
    p.rerender({ element: { ...node, id: "n9" } });
    expect(screen.getByRole("heading", { name: "The Matrix" })).toHaveFocus();
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

describe("GraphInspector element id", () => {
  it("has no id row for an element the database gave no id", () => {
    setup({ element: { ...rel, id: "rel-A-B-1", databaseId: undefined } });
    expect(screen.queryByTestId("graph-inspector-id")).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Copy element id" }),
    ).toBeNull();
  });
});

describe("graphInspectorWidth", () => {
  it.each([
    [0, 280],
    [526, 263],
    [900, 300],
    [1200, 380],
  ])("a graph %ipx wide gets %ipx", (graph, panel) => {
    expect(graphInspectorWidth(graph)).toBeCloseTo(panel, 5);
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

  it("does not bring a blocked copy's text back when the element comes back", async () => {
    const user = userEvent.setup();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(
      new Error("denied"),
    );
    const p = setup();
    await user.click(screen.getByRole("button", { name: "Copy node as JSON" }));
    await screen.findByRole("textbox", { name: "Text to copy" });
    p.rerender({ element: { ...node, id: "n2" } });
    expect(screen.queryByRole("textbox")).toBeNull();
    p.rerender({ element: node });
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

  /** Connections starts closed: open it. */
  const openConnections = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: /^Connections/ }));

  it("groups by type and direction and counts them", async () => {
    const user = userEvent.setup();
    setup({ connections: conns });
    await openConnections(user);
    expect(screen.getByText("5 on this graph")).toBeInTheDocument();
    const groups = screen.getAllByTestId("connection-group");
    expect(groups.map((g) => g.getAttribute("data-group"))).toEqual([
      "ACTED_IN|from",
      "DIRECTED|to",
      "REVIEWED|from",
    ]);
  });

  it("marks parallel relationships to the same node as 1 of 2", async () => {
    const user = userEvent.setup();
    setup({ connections: conns });
    await openConnections(user);
    const reviewed = screen
      .getAllByTestId("connection-group")
      .find((g) => g.getAttribute("data-group") === "REVIEWED|from")!;
    const rows = within(reviewed).getAllByRole("button", { name: /Jessica/ });
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
    await openConnections(user);
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
    await openConnections(user);
    const group = screen.getByTestId("connection-group");
    expect(
      within(group).getAllByRole("button", { name: /^KNOWS to/ }),
    ).toHaveLength(5);
    await user.click(within(group).getByRole("button", { name: "+2 more" }));
    expect(
      within(group).getAllByRole("button", { name: /^KNOWS to/ }),
    ).toHaveLength(7);
  });

  it("collapses an expanded group again on another element", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 7 }, (_, i) => ({
      id: `m${i}`,
      type: "KNOWS",
      direction: "to" as const,
      otherId: `o${i}`,
      otherName: `Person ${i}`,
    }));
    const p = setup({ connections: many });
    await openConnections(user);
    await user.click(screen.getByRole("button", { name: "+2 more" }));
    p.rerender({ element: { ...node, id: "n2" }, connections: many });
    await openConnections(user);
    expect(screen.getByRole("button", { name: "+2 more" })).toBeInTheDocument();
  });

  it("says when a node has none", async () => {
    const user = userEvent.setup();
    setup({ connections: [] });
    await openConnections(user);
    expect(screen.getByText("None on this graph.")).toBeInTheDocument();
  });

  it("has no Connections section on a relationship", () => {
    setup({ element: rel, connections: conns });
    expect(screen.queryByText("Connections")).toBeNull();
  });

  it("starts closed, opens from its title row and closes again", async () => {
    const user = userEvent.setup();
    setup({ connections: conns });
    const toggle = screen.getByRole("button", { name: /^Connections/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: /^ACTED_IN/ })).toBeNull();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(
      document.getElementById(toggle.getAttribute("aria-controls")!),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: /^ACTED_IN from Keanu/ }),
    ).toBeVisible();
    await user.click(toggle);
    expect(
      screen.queryByRole("button", { name: /^ACTED_IN from Keanu/ }),
    ).toBeNull();
  });

  it("collapses one type group and leaves the others open", async () => {
    const user = userEvent.setup();
    setup({ connections: conns });
    await openConnections(user);
    const acted = screen
      .getAllByTestId("connection-group")
      .find((g) => g.getAttribute("data-group") === "ACTED_IN|from")!;
    const toggle = within(acted).getByRole("button", {
      name: /^ACTED_IN/,
      expanded: true,
    });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(within(acted).queryByRole("button", { name: /Keanu/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /^DIRECTED to Lana/ }),
    ).toBeVisible();
  });
});

describe("GraphInspector sections", () => {
  it("opens Properties, closes it from its title row, and brings it back", async () => {
    const user = userEvent.setup();
    setup();
    const toggle = screen.getByRole("button", { name: /^Properties/ });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("released")).toBeVisible();
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("released")).not.toBeVisible();
    await user.click(toggle);
    expect(screen.getByText("released")).toBeVisible();
  });

  it("keeps the count beside the title", () => {
    setup({ connections: [] });
    expect(
      screen.getByRole("button", { name: "Properties 4" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Connections 0 on this graph" }),
    ).toBeInTheDocument();
  });

  it("goes back to the defaults on another element", async () => {
    const user = userEvent.setup();
    const p = setup({ connections: [] });
    await user.click(screen.getByRole("button", { name: /^Properties/ }));
    await user.click(screen.getByRole("button", { name: /^Connections/ }));
    p.rerender({ element: { ...node, id: "n2" }, connections: [] });
    expect(screen.getByRole("button", { name: /^Properties/ })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    expect(
      screen.getByRole("button", { name: /^Connections/ }),
    ).toHaveAttribute("aria-expanded", "false");
  });
});
