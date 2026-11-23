/**
 * GraphExplorationWrapper — property inspector wiring (#1191).
 *
 * The GraphChart itself is NVL/WebGL-backed and cannot render in jsdom, so it
 * is stubbed here; the code under test is this wrapper's own `handleNodeSelect`
 * — specifically the `ids.length === 1` rule that decides whether the property
 * inspector opens. GraphChart's own click-to-selection semantics (plain click
 * replaces, Cmd/Ctrl/Shift toggle) are covered where they live, in
 * component/src/charts/__tests__/graph-chart.test.tsx. Together the two prove
 * the chain that #1191 broke: a plain click yields exactly one id, and exactly
 * one id opens the inspector.
 */
import {
  render,
  screen,
  act,
  cleanup,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphExplorationWrapper } from "../graph-exploration-wrapper";
import { GraphExpansionAccessProvider } from "../graph-expansion-access-context";
import { useGraphWidgetStore } from "@/stores/graph-widget-store";

/** Props last handed to the stubbed GraphChart. */
let chartProps: Record<string, unknown> = {};
/** Options last handed to the stubbed useGraphExploration. */
let explorationOptions: {
  fetchNeighbors?: (node: { id: string }) => Promise<unknown>;
} = {};

const graphNodes = [
  {
    id: "A",
    label: "Alice",
    labels: ["Person", "Founder"],
    properties: {
      name: "Alice",
      aliases: ["Al", "Ally"],
      home: { srid: 4326, x: 1.5, y: 2.5 },
      gone: null,
    },
  },
  { id: "B", label: "Bob", properties: { name: "Bob" } },
];

/** Toasts the wrapper raised. */
let toasts: unknown[] = [];

/** Props last handed to the stubbed GraphInspector. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a stub's captured props
let inspectorProps: Record<string, any> = {};

/** What the stubbed exploration says about every node's expandability. */
let expandable = false;

const explorationStub = {
  nodes: graphNodes,
  edges: [] as {
    id?: string;
    source: string;
    target: string;
    label?: string;
    properties?: Record<string, unknown>;
  }[],
  selectedNodeIds: [],
  onNodeSelect: vi.fn(),
  onExpandRequest: vi.fn(async (_node: { id: string }) => {}),
  collapse: () => {},
  canExpand: () => expandable,
  canCollapse: () => false,
  reset: () => {},
  expandedNodeIds: [],
  expandingNodeId: null,
};

vi.mock("@neoboard/components", () => ({
  // Renders the footer slot like the real chart: the wrapper's status bar
  // lives there (#2229), so the DOM assertions below still see it.
  GraphChart: (props: Record<string, unknown>) => {
    chartProps = props;
    return (
      <div data-testid="graph-chart">{props.footer as React.ReactNode}</div>
    );
  },
  // Must be referentially stable across renders: the wrapper persists
  // `exploration.nodes` / `.edges` to the store in an effect keyed on their
  // identity, so a fresh object each render would loop forever.
  useGraphExploration: (options: typeof explorationOptions) => {
    explorationOptions = options;
    return explorationStub;
  },
  GraphInspector: (props: Record<string, unknown>) => {
    inspectorProps = props;
    const element = props.element as { kind: string; title: string };
    return (
      <section
        data-testid="graph-inspector"
        aria-label={`${element.kind}: ${element.title}`}
      />
    );
  },
  graphInspectorWidth: () => 280,
  useDarkMode: () => false,
  toast: (t: unknown) => toasts.push(t),
}));

vi.mock("@neoboard/components/charts/graph-labels", () => ({
  graphNodeCaption: (node: { id: string; label?: string }) =>
    node.label ?? node.id,
  describeGraphNode: (node: { id: string; label?: string }) => ({
    caption: node.label ?? node.id,
    color: "#123456",
  }),
  relationshipId: (e: { source: string; target: string }, i: number) =>
    `rel-${e.source}-${e.target}-${i}`,
}));

// Node expansion reads its response through these; only the request it sends
// is under test here.
vi.mock("@/lib/api/api-client", () => ({
  unwrapFullResponse: async () => ({ data: { data: [] } }),
}));
vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: () => ({ transform: () => ({ nodes: [], edges: [] }) }),
}));

// The connector that ran the widget's query, as the query result names it — a
// fixture nothing in app/ has heard of, so the expand query can only have come
// from it (#2061).
const EXPANSION = {
  query: "EXPAND NEIGHBOURS OF @vertex",
  nodeIdParam: "vertex",
};
let connectorType: string | undefined;
let connectors: Record<string, { graphExpansion?: typeof EXPANSION }> = {};
// This user can list no connection, as a dashboard editor on its owner's
// private one cannot: Expand must not depend on the list (#2061 review).
vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-connectors", () => ({
  useConnector: (type: string | undefined) =>
    type === undefined ? undefined : connectors[type],
}));

beforeEach(() => {
  // The stub is shared by every suite: nothing a test sets may leak (shuffle).
  explorationStub.nodes = graphNodes;
  explorationStub.edges = [];
  expandable = false;
  connectorType = "fixturedb";
  connectors = { fixturedb: { graphExpansion: EXPANSION } };
});

function renderWrapper(onChartClick?: (p: Record<string, unknown>) => void) {
  render(
    <GraphExplorationWrapper
      widgetId="w1"
      nodes={graphNodes}
      edges={[]}
      connectionId="c1"
      connectorType={connectorType}
      settings={{}}
      resultId="r1"
      onChartClick={onChartClick}
    />,
  );
  return chartProps.onNodeSelect as (ids: string[]) => void;
}

describe("GraphExplorationWrapper — graph inspector (#1191, #2515)", () => {
  beforeEach(() => {
    chartProps = {};
    inspectorProps = {};
    toasts = [];
    explorationStub.edges = [];
    explorationStub.onNodeSelect.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  const clickEdge = (edge: Record<string, unknown>) =>
    act(() =>
      (chartProps.onRelationshipClick as (e: unknown) => void)({ edge }),
    );

  it("a node click carries the node's id, labels and properties (#2526)", () => {
    const onChartClick = vi.fn();
    const onNodeSelect = renderWrapper(onChartClick);
    act(() => onNodeSelect(["A"]));
    expect(onChartClick).toHaveBeenCalledWith(
      expect.objectContaining({
        nodeId: "A",
        labels: ["Person", "Founder"],
        name: "Alice",
      }),
    );
  });

  it("opens the inspector for the clicked node on a single-id selection", () => {
    const onNodeSelect = renderWrapper();
    expect(screen.queryByTestId("graph-inspector")).not.toBeInTheDocument();

    act(() => onNodeSelect(["A"]));

    expect(
      screen.getByRole("region", { name: "node: Alice" }),
    ).toBeInTheDocument();
    expect(inspectorProps.element).toMatchObject({
      kind: "node",
      id: "A",
      title: "Alice",
      color: "#123456",
      labels: ["Person", "Founder"],
    });
  });

  it("hands a node's lists and maps to the panel as structure", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));

    expect(inspectorProps.element.properties).toEqual([
      { key: "name", value: "Alice" },
      { key: "aliases", value: ["Al", "Ally"] },
      { key: "home", value: { srid: 4326, x: 1.5, y: 2.5 } },
      { key: "gone", value: null },
    ]);
  });

  it("hands a relationship's type, ends and structured properties to the panel", () => {
    const edge = {
      id: "e1",
      source: "A",
      target: "B",
      label: "OWNS",
      properties: { since: [2020, 2021], terms: { rate: 3 } },
    };
    explorationStub.edges = [edge];
    renderWrapper();
    clickEdge(edge);
    expect(inspectorProps.element.properties).toEqual([
      { key: "since", value: [2020, 2021] },
      { key: "terms", value: { rate: 3 } },
    ]);
  });

  it("re-targets the inspector when the next single-id selection arrives", () => {
    // This is the flow #1191 made impossible: inspect A, then inspect B.
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    expect(inspectorProps.element.id).toBe("A");

    act(() => onNodeSelect(["B"]));

    expect(inspectorProps.element.id).toBe("B");
  });

  it("closes the inspector when the selection holds more than one node", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    expect(screen.getByTestId("graph-inspector")).toBeInTheDocument();

    act(() => onNodeSelect(["A", "B"]));

    expect(screen.queryByTestId("graph-inspector")).not.toBeInTheDocument();
  });

  it("closes the inspector when the selection is cleared", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));

    act(() => onNodeSelect([]));

    expect(screen.queryByTestId("graph-inspector")).not.toBeInTheDocument();
  });

  describe("with relationships on the graph", () => {
    beforeEach(() => {
      explorationStub.edges = [
        {
          id: "e1",
          source: "A",
          target: "B",
          label: "OWNS",
          properties: { since: [2020, 2021] },
        },
        {
          id: "e2",
          source: "B",
          target: "A",
          label: "OWNS",
          properties: { since: 1999 },
        },
        { id: "e3", source: "A", target: "B", label: "KNOWS" },
        { id: "e4", source: "A", target: "C", label: "KNOWS" },
      ];
    });

    it("builds a node's connections from the edges, by direction, with the other end's caption", () => {
      const onNodeSelect = renderWrapper();
      act(() => onNodeSelect(["A"]));
      expect(inspectorProps.connections).toEqual([
        {
          id: "e1",
          type: "OWNS",
          direction: "to",
          otherId: "B",
          otherName: "Bob",
        },
        {
          id: "e2",
          type: "OWNS",
          direction: "from",
          otherId: "B",
          otherName: "Bob",
        },
        {
          id: "e3",
          type: "KNOWS",
          direction: "to",
          otherId: "B",
          otherName: "Bob",
        },
        {
          id: "e4",
          type: "KNOWS",
          direction: "to",
          otherId: "C",
          otherName: "C",
        },
      ]);
    });

    it("lists as siblings every relationship between the same two nodes, in both directions", () => {
      renderWrapper();
      clickEdge(explorationStub.edges[0]);
      expect(inspectorProps.element).toMatchObject({
        kind: "relationship",
        id: "e1",
        title: "OWNS",
        source: { id: "A", name: "Alice" },
        target: { id: "B", name: "Bob" },
        siblings: ["e1", "e2", "e3"],
      });
      expect(inspectorProps.element.properties).toEqual([
        { key: "since", value: [2020, 2021] },
      ]);
    });

    it("orders parallel relationships by id, whatever order the graph holds them in", () => {
      explorationStub.edges = [
        { id: "e10", source: "A", target: "B", label: "KNOWS" },
        { id: "e2", source: "A", target: "B", label: "KNOWS" },
        { id: "e1", source: "B", target: "A", label: "KNOWS" },
      ];
      renderWrapper();
      clickEdge(explorationStub.edges[0]);
      expect(inspectorProps.element.siblings).toEqual(["e1", "e2", "e10"]);
    });

    it("highlights the inspected relationship on the canvas and follows the stepper", () => {
      renderWrapper();
      expect(chartProps.selectedRelationshipId).toBeUndefined();
      clickEdge(explorationStub.edges[0]);
      expect(chartProps.selectedRelationshipId).toBe("e1");

      act(() => inspectorProps.onSelectRelationship("e2"));

      expect(inspectorProps.element.id).toBe("e2");
      expect(inspectorProps.element.source.id).toBe("B");
      expect(chartProps.selectedRelationshipId).toBe("e2");
    });

    it("an end link selects that node and inspects it", () => {
      renderWrapper();
      clickEdge(explorationStub.edges[0]);
      act(() => inspectorProps.onSelectNode("B"));
      expect(inspectorProps.element).toMatchObject({ kind: "node", id: "B" });
      expect(explorationStub.onNodeSelect).toHaveBeenLastCalledWith(["B"]);
    });

    it("copies a relationship as JSON: kind, id, type, source, target and properties as received", () => {
      renderWrapper();
      clickEdge(explorationStub.edges[0]);
      expect(JSON.parse(inspectorProps.elementJson)).toEqual({
        kind: "relationship",
        id: "e1",
        type: "OWNS",
        source: "A",
        target: "B",
        properties: { since: [2020, 2021] },
      });
    });

    it("shows a relationship's and a node's own id as their element id", () => {
      const onNodeSelect = renderWrapper();
      clickEdge(explorationStub.edges[0]);
      expect(inspectorProps.element.databaseId).toBe("e1");
      act(() => onNodeSelect(["A"]));
      expect(inspectorProps.element.databaseId).toBe("A");
    });

    it("opens the parallel relationship by its id even if the chart hands back a copy", () => {
      explorationStub.edges = [
        { id: "x1", source: "A", target: "B", label: "KNOWS" },
        { id: "x2", source: "A", target: "B", label: "KNOWS" },
      ];
      renderWrapper();
      clickEdge({ ...explorationStub.edges[1] });
      expect(inspectorProps.element.id).toBe("x2");
    });

    it("tells a relationship without an id apart by its position", () => {
      explorationStub.edges = [
        { source: "A", target: "B", label: "KNOWS" },
        { source: "A", target: "B", label: "KNOWS" },
      ];
      renderWrapper();
      clickEdge(explorationStub.edges[1]);
      expect(inspectorProps.element.id).toBe("rel-A-B-1");
      // The position is how the graph tells it apart, not a database id.
      expect(inspectorProps.element.databaseId).toBeUndefined();
      expect(inspectorProps.element.siblings).toEqual([
        "rel-A-B-0",
        "rel-A-B-1",
      ]);
      expect(chartProps.selectedRelationshipId).toBe("rel-A-B-1");
      expect(JSON.parse(inspectorProps.elementJson)).not.toHaveProperty("id");
    });
  });

  it("copies a node as JSON: kind, id, labels and properties as received", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    expect(JSON.parse(inspectorProps.elementJson)).toEqual({
      kind: "node",
      id: "A",
      labels: ["Person", "Founder"],
      properties: graphNodes[0].properties,
    });
  });

  it("toasts what was copied, and that the browser blocked the clipboard", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    act(() => inspectorProps.onCopied("the node as JSON"));
    expect(toasts).toContainEqual({ title: "Copied the node as JSON" });
    act(() => inspectorProps.onCopyBlocked());
    expect(toasts[1]).toMatchObject({
      title: "The browser blocked the clipboard",
    });
  });

  it("keeps Escape for the inspector while it is open", () => {
    const onNodeSelect = renderWrapper();
    const graph = screen.getByTestId("graph-exploration");
    expect(graph).not.toHaveAttribute("data-keeps-escape");
    act(() => onNodeSelect(["A"]));
    expect(graph).toHaveAttribute("data-keeps-escape");
  });

  it("closes the inspector when its element leaves the graph (a Collapse)", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    expect(screen.getByTestId("graph-inspector")).toBeInTheDocument();

    explorationStub.nodes = [graphNodes[1]];
    act(() => onNodeSelect(["B"]));
    act(() => inspectorProps.onSelectNode("A"));

    expect(screen.queryByTestId("graph-inspector")).not.toBeInTheDocument();
    expect(screen.getByTestId("graph-exploration")).toHaveFocus();
  });

  it("closing clears the selection and puts focus back on the graph", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    explorationStub.onNodeSelect.mockClear();

    act(() => inspectorProps.onClose());

    expect(screen.queryByTestId("graph-inspector")).not.toBeInTheDocument();
    expect(explorationStub.onNodeSelect).toHaveBeenCalledWith([]);
    expect(screen.getByTestId("graph-exploration")).toHaveFocus();
  });

  describe("the side it docks to", () => {
    const pointerDownAt = (clientX: number) =>
      fireEvent.pointerDown(screen.getByTestId("graph-exploration"), {
        clientX,
      });

    beforeEach(() => {
      vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(
        600,
      );
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("opens on the right when the click is clear of it, and on the left when it would sit under it", () => {
      const onNodeSelect = renderWrapper();
      pointerDownAt(100);
      act(() => onNodeSelect(["A"]));
      expect(inspectorProps.side).toBe("right");
      expect(chartProps.overlayInset).toEqual({ side: "right", width: 280 });

      act(() => onNodeSelect([]));
      pointerDownAt(500);
      act(() => onNodeSelect(["A"]));
      expect(inspectorProps.side).toBe("left");
      expect(chartProps.overlayInset).toEqual({ side: "left", width: 280 });
    });

    it("keeps its side while open, however the next click lands", () => {
      const onNodeSelect = renderWrapper();
      pointerDownAt(500);
      act(() => onNodeSelect(["A"]));
      pointerDownAt(100);
      act(() => onNodeSelect(["B"]));
      expect(inspectorProps.side).toBe("left");
    });

    it("leaves the chart alone when closed", () => {
      renderWrapper();
      expect(chartProps.overlayInset).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// #1521 — this wrapper renders its own status bar, so the chart's overlay pill
// must be suppressed. Both carried data-testid="graph-node-count", so the same
// counts appeared twice in one widget.
//
// Asserted on the props handed to the stub rather than by counting rendered
// elements: GraphChart is NVL-backed and stubbed here, so its pill never
// renders in jsdom and a DOM count would pass whether or not the wrapper asked
// for suppression. The prop IS the contract.
// ---------------------------------------------------------------------------

describe("GraphExplorationWrapper — no duplicate node counts (#1521)", () => {
  it("tells GraphChart not to render its own node count", () => {
    renderWrapper();
    expect(chartProps.showNodeCount).toBe(false);
  });

  it("renders exactly one node-count element of its own", () => {
    renderWrapper();
    expect(screen.getAllByTestId("graph-node-count")).toHaveLength(1);
    expect(screen.getByTestId("graph-node-count")).toHaveTextContent("2 nodes");
  });

  it("still renders its status bar", () => {
    renderWrapper();
    expect(screen.getByTestId("graph-status-bar")).toBeInTheDocument();
    expect(screen.getByTestId("graph-edge-count")).toHaveTextContent("0 edges");
  });
});

// ---------------------------------------------------------------------------
// #1824 — expanding a node looks it up where the graph was queried: on the
// database the widget saves. An element id from one database finds nothing,
// or the wrong node, in another.
// ---------------------------------------------------------------------------

describe("GraphExplorationWrapper — node expansion runs on the widget's saved database (#1824)", () => {
  const fetchMock = vi.fn(async () => ({}) as Response);

  beforeEach(() => {
    explorationOptions = {};
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /** The body of the request expanding node A, for a widget saved on `database`. */
  async function expansionBody(database?: string) {
    render(
      <GraphExplorationWrapper
        widgetId="w1"
        nodes={graphNodes}
        edges={[]}
        connectionId="c1"
        connectorType={connectorType}
        database={database}
        settings={{}}
        resultId="r1"
      />,
    );
    await explorationOptions.fetchNeighbors!({ id: "A" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("/api/query");
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it("sends the database the widget saves", async () => {
    expect(await expansionBody("neoboard")).toMatchObject({
      database: "neoboard",
    });
  });

  // #2061: the query and its parameter's name are the connector's, read off
  // its descriptor. They were hard-coded here, in one connector's dialect.
  it("sends the connector's own query, the node's id under its own parameter name", async () => {
    expect(await expansionBody()).toEqual({
      connectionId: "c1",
      query: "EXPAND NEIGHBOURS OF @vertex",
      params: { vertex: "A" },
    });
  });

  it("sends no database when the widget saves none", async () => {
    expect(await expansionBody()).not.toHaveProperty("database");
  });

  it("sends the database it was given last", async () => {
    const props = {
      widgetId: "w1",
      nodes: graphNodes,
      edges: [],
      connectionId: "c1",
      connectorType,
      settings: {},
      resultId: "r1",
    };
    const { rerender } = render(
      <GraphExplorationWrapper {...props} database="neoboard" />,
    );
    rerender(<GraphExplorationWrapper {...props} database="movies" />);
    await explorationOptions.fetchNeighbors!({ id: "A" });
    const [, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(JSON.parse(String(init.body)).database).toBe("movies");
  });
});

// ---------------------------------------------------------------------------
// #2061 — a connector that declares no graph expansion has nothing to expand
// with: no Expand in the menu, and nothing posted. So does a result that names
// no connector, and a connector that is not installed.
// ---------------------------------------------------------------------------

describe("GraphExplorationWrapper — Expand only when the connector declares how (#2061)", () => {
  const fetchMock = vi.fn(async () => ({}) as Response);

  beforeEach(() => {
    expandable = true;
    explorationOptions = {};
    fetchMock.mockClear();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function openMenuOnA() {
    renderWrapper();
    const onNodeRightClick = chartProps.onNodeRightClick as (e: {
      node: { id: string };
      position: { x: number; y: number };
    }) => void;
    act(() =>
      onNodeRightClick({ node: graphNodes[0], position: { x: 1, y: 1 } }),
    );
  }

  it("offers Expand when the connector that ran the query declares it, on a connection the user cannot list", () => {
    openMenuOnA();
    expect(screen.getByRole("button", { name: "Expand" })).toBeInTheDocument();
  });

  it.each([
    ["its connector declares no expansion", () => (connectors.fixturedb = {})],
    ["its connector is not installed", () => (connectors = {})],
    [
      "no connector came with the query result",
      () => (connectorType = undefined),
    ],
  ])("offers no Expand, and posts nothing, when %s", async (_case, arrange) => {
    arrange();
    openMenuOnA();
    expect(screen.getByRole("button", { name: "Properties" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Expand" }),
    ).not.toBeInTheDocument();

    await expect(
      explorationOptions.fetchNeighbors!({ id: "A" }),
    ).resolves.toEqual({ nodes: [], edges: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // A failed expansion used to reject into the void: the spinner stopped and
  // nothing said why.
  it("says why when an expansion fails", async () => {
    toasts = [];
    explorationStub.onExpandRequest.mockRejectedValueOnce(
      new Error("Connection refused"),
    );
    openMenuOnA();
    fireEvent.click(screen.getByRole("button", { name: "Expand" }));
    await waitFor(() =>
      expect(toasts).toEqual([
        {
          title: "Expand failed",
          description: "Connection refused",
          variant: "destructive",
        },
      ]),
    );
  });

  // #1828: Expand is offered where the server accepts it, per connection.
  it.each([
    ["a viewer on a connection they can use", ["other"], true],
    ["a viewer on a connection they cannot use", ["c1"], false],
  ])("%s: Expand offered is %s", (_label, unusable, offered) => {
    render(
      <GraphExpansionAccessProvider value={(id) => !unusable.includes(id)}>
        <GraphExplorationWrapper
          widgetId="w1"
          nodes={graphNodes}
          edges={[]}
          connectionId="c1"
          connectorType={connectorType}
          settings={{}}
          resultId="r1"
        />
      </GraphExpansionAccessProvider>,
    );
    act(() =>
      (
        chartProps.onNodeRightClick as (e: {
          node: { id: string };
          position: { x: number; y: number };
        }) => void
      )({ node: graphNodes[0], position: { x: 1, y: 1 } }),
    );
    expect(screen.getByRole("button", { name: "Properties" })).toBeVisible();
    expect(!!screen.queryByRole("button", { name: "Expand" })).toBe(offered);
  });

  // A viewer bound to the dashboard's own queries (#972) is offered Expand and
  // refused on the server; the server's words assume they wrote a query.
  it("tells a viewer bound to the dashboard's queries why it cannot expand", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403 } as Response);
    renderWrapper();
    await expect(
      explorationOptions.fetchNeighbors!({ id: "A" }),
    ).rejects.toThrow(
      "Your access to this dashboard covers its own queries, and expanding a node runs another.",
    );
  });
});

// ---------------------------------------------------------------------------
// #1509 — the expanded copy opens from the tile's settled layout.
// ---------------------------------------------------------------------------

describe("GraphExplorationWrapper — expanded copy seeds from the tile (#1509)", () => {
  const tile = { A: { x: 1, y: 2 }, B: { x: 3, y: 4 } };

  function renderCopy(resultId: string) {
    useGraphWidgetStore.setState({
      states: {
        w1: { nodes: graphNodes, edges: [], resultId: "r1", positions: tile },
      },
    });
    render(
      <GraphExplorationWrapper
        widgetId="w1--fullscreen"
        nodes={graphNodes}
        edges={[]}
        connectionId="c1"
        connectorType={connectorType}
        settings={{}}
        resultId={resultId}
      />,
    );
  }

  afterEach(() => {
    cleanup();
    useGraphWidgetStore.setState({ states: {} });
  });

  it("hands the tile's positions to the chart", () => {
    renderCopy("r1");
    expect(chartProps.initialPositions).toEqual(tile);
  });

  it("ignores the tile's positions after the query changed", () => {
    renderCopy("r2");
    expect(chartProps.initialPositions).toBeUndefined();
  });

  it("stores the positions the chart reports under its own id", () => {
    renderCopy("r1");
    act(() =>
      (chartProps.onPositionsChange as (p: unknown) => void)({
        A: { x: 9, y: 9 },
      }),
    );
    expect(
      useGraphWidgetStore.getState().states["w1--fullscreen"]?.positions,
    ).toEqual({ A: { x: 9, y: 9 } });
    expect(useGraphWidgetStore.getState().states.w1?.positions).toEqual(tile);
  });
});
