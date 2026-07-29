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
import { render, screen, act, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GraphExplorationWrapper } from "../graph-exploration-wrapper";

/** Props last handed to the stubbed GraphChart. */
let chartProps: Record<string, unknown> = {};

const graphNodes = [
  { id: "A", label: "Alice", properties: { name: "Alice" } },
  { id: "B", label: "Bob", properties: { name: "Bob" } },
];

const explorationStub = {
  nodes: graphNodes,
  edges: [],
  selectedNodeIds: [],
  onNodeSelect: () => {},
  onExpandRequest: () => {},
  collapse: () => {},
  canExpand: () => false,
  canCollapse: () => false,
  reset: () => {},
  expandedNodeIds: [],
  expandingNodeId: null,
};

vi.mock("@neoboard/components", () => ({
  GraphChart: (props: Record<string, unknown>) => {
    chartProps = props;
    return <div data-testid="graph-chart" />;
  },
  // Must be referentially stable across renders: the wrapper persists
  // `exploration.nodes` / `.edges` to the store in an effect keyed on their
  // identity, so a fresh object each render would loop forever.
  useGraphExploration: () => explorationStub,
  PropertyPanel: ({
    sections,
  }: {
    sections: { title: string; items: { key: string; value: string }[] }[];
  }) => (
    <div data-testid="property-panel">
      {sections.flatMap((s) =>
        s.items.map((i) => (
          <span key={`${s.title}-${i.key}`}>{`${i.key}=${i.value}`}</span>
        )),
      )}
    </div>
  ),
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));

function renderWrapper() {
  render(
    <GraphExplorationWrapper
      widgetId="w1"
      nodes={graphNodes}
      edges={[]}
      connectionId="c1"
      settings={{}}
      resultId="r1"
    />,
  );
  return chartProps.onNodeSelect as (ids: string[]) => void;
}

describe("GraphExplorationWrapper — property inspector (#1191)", () => {
  beforeEach(() => {
    chartProps = {};
  });

  afterEach(() => {
    cleanup();
  });

  it("opens the inspector for the clicked node on a single-id selection", () => {
    const onNodeSelect = renderWrapper();
    expect(screen.queryByTestId("property-panel")).not.toBeInTheDocument();

    act(() => onNodeSelect(["A"]));

    expect(screen.getByTestId("property-panel")).toBeInTheDocument();
    expect(screen.getByText("id=A")).toBeInTheDocument();
    expect(screen.getByText("name=Alice")).toBeInTheDocument();
  });

  it("re-targets the inspector when the next single-id selection arrives", () => {
    // This is the flow #1191 made impossible: inspect A, then inspect B.
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    expect(screen.getByText("name=Alice")).toBeInTheDocument();

    act(() => onNodeSelect(["B"]));

    expect(screen.getByText("name=Bob")).toBeInTheDocument();
    expect(screen.queryByText("name=Alice")).not.toBeInTheDocument();
  });

  it("closes the inspector when the selection holds more than one node", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));
    expect(screen.getByTestId("property-panel")).toBeInTheDocument();

    act(() => onNodeSelect(["A", "B"]));

    expect(screen.queryByTestId("property-panel")).not.toBeInTheDocument();
  });

  it("closes the inspector when the selection is cleared", () => {
    const onNodeSelect = renderWrapper();
    act(() => onNodeSelect(["A"]));

    act(() => onNodeSelect([]));

    expect(screen.queryByTestId("property-panel")).not.toBeInTheDocument();
  });
});
