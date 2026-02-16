import { useState, useRef, useEffect, useCallback } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { GraphChart } from "@/charts/graph-chart";
import type { GraphChartRef } from "@/charts/graph-chart";
import type { GraphNode, GraphEdge, GraphNodeEvent } from "@/charts/types";
import { useGraphExploration } from "@/hooks/useGraphExploration";

const meta = {
  title: "Charts/GraphChart",
  component: GraphChart,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  decorators: [
    (Story) => (
      <div style={{ width: "100%", height: 500 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphChart>;

export default meta;
type Story = StoryObj<typeof meta>;

const socialNodes: GraphNode[] = [
  { id: "alice", label: "Alice", value: 40 },
  { id: "bob", label: "Bob", value: 30 },
  { id: "charlie", label: "Charlie", value: 35 },
  { id: "diana", label: "Diana", value: 25 },
  { id: "eve", label: "Eve", value: 20 },
];

const socialEdges = [
  { source: "alice", target: "bob", label: "friends" },
  { source: "alice", target: "charlie", label: "colleagues" },
  { source: "bob", target: "diana", label: "friends" },
  { source: "charlie", target: "diana", label: "manages" },
  { source: "diana", target: "eve", label: "mentors" },
  { source: "eve", target: "alice", label: "reports_to" },
];

export const Default: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
  },
};

export const CircularLayout: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
    layout: "circular",
  },
};

export const WithCategories: Story = {
  args: {
    nodes: [
      { id: "alice", label: "Alice", value: 40, category: 0 },
      { id: "bob", label: "Bob", value: 30, category: 0 },
      { id: "acme", label: "Acme Corp", value: 50, category: 1 },
      { id: "globex", label: "Globex", value: 45, category: 1 },
      { id: "charlie", label: "Charlie", value: 35, category: 0 },
    ],
    edges: [
      { source: "alice", target: "acme", label: "works_at" },
      { source: "bob", target: "globex", label: "works_at" },
      { source: "charlie", target: "acme", label: "works_at" },
      { source: "alice", target: "bob", label: "knows" },
    ],
    categories: ["Person", "Company"],
  },
};

export const WithProperties: Story = {
  args: {
    nodes: [
      { id: "alice", label: "Alice", value: 40, properties: { age: 32, role: "Engineer", team: "Platform" } },
      { id: "bob", label: "Bob", value: 30, properties: { age: 28, role: "Designer", team: "Product" } },
      { id: "charlie", label: "Charlie", value: 35, properties: { age: 45, role: "Manager", team: "Platform" } },
    ],
    edges: [
      { source: "alice", target: "bob", label: "collaborates", properties: { since: 2022 } },
      { source: "alice", target: "charlie", label: "reports_to", properties: { since: 2021 } },
    ],
  },
};

export const WithNodeColors: Story = {
  args: {
    nodes: [
      { id: "1", label: "Critical", value: 40, color: "#ef4444" },
      { id: "2", label: "Warning", value: 30, color: "#f59e0b" },
      { id: "3", label: "Healthy", value: 35, color: "#22c55e" },
      { id: "4", label: "Info", value: 25, color: "#3b82f6" },
    ],
    edges: [
      { source: "1", target: "2", color: "#ef4444" },
      { source: "2", target: "3", color: "#f59e0b" },
      { source: "3", target: "4", color: "#22c55e" },
    ],
  },
};

export const WithSelection: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
    selectedNodeIds: ["alice", "charlie"],
  },
};

export const CustomEdgeStyle: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
    edgeStyle: { curveness: 0.3, width: 2, opacity: 0.6 },
  },
};

function InteractiveExplorationStory() {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [lastEvent, setLastEvent] = useState<string>("Click on nodes to select, double-click to expand, right-click for context menu");
  const chartRef = useRef<GraphChartRef>(null);

  return (
    <div style={{ height: 500 }}>
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
        <button onClick={() => chartRef.current?.zoomToFit()} style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4 }}>
          Zoom to Fit
        </button>
        <button onClick={() => setSelectedIds([])} style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4 }}>
          Clear Selection
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>{lastEvent}</span>
      </div>
      <GraphChart
        ref={chartRef}
        nodes={socialNodes.map((n) => ({
          ...n,
          properties: { role: "Person", connections: Math.floor(Math.random() * 10) },
        }))}
        edges={socialEdges}
        selectedNodeIds={selectedIds}
        onNodeSelect={(ids) => {
          setSelectedIds(ids);
          setLastEvent(`Selected: ${ids.join(", ") || "none"}`);
        }}
        onNodeDoubleClick={(e: GraphNodeEvent) => {
          setLastEvent(`Double-clicked: ${e.node.label} at (${e.position.x}, ${e.position.y})`);
        }}
        onNodeRightClick={(e: GraphNodeEvent) => {
          setLastEvent(`Right-clicked: ${e.node.label} at (${e.position.x}, ${e.position.y})`);
        }}
        onExpandRequest={(node: GraphNode) => {
          setLastEvent(`Expand requested for: ${node.label}`);
        }}
      />
    </div>
  );
}

export const InteractiveExploration: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
  },
  render: () => <InteractiveExplorationStory />,
};

// --- Path Expansion Story ---

// Simulated graph database: nodes and their neighbors
const graphDb: Record<string, { nodes: GraphNode[]; edges: GraphEdge[] }> = {
  alice: {
    nodes: [
      { id: "frank", label: "Frank", value: 30, color: "#8b5cf6", properties: { role: "Designer", team: "Product" } },
      { id: "grace", label: "Grace", value: 25, color: "#ec4899", properties: { role: "PM", team: "Product" } },
    ],
    edges: [
      { source: "alice", target: "frank", label: "collaborates" },
      { source: "alice", target: "grace", label: "reports_to" },
    ],
  },
  bob: {
    nodes: [
      { id: "henry", label: "Henry", value: 20, color: "#f59e0b", properties: { role: "QA", team: "Platform" } },
      { id: "alice", label: "Alice", value: 40, properties: { role: "Engineer", team: "Platform" } }, // already exists
    ],
    edges: [
      { source: "bob", target: "henry", label: "mentors" },
      { source: "bob", target: "alice", label: "friends" }, // deduplicated edge
    ],
  },
  frank: {
    nodes: [
      { id: "iris", label: "Iris", value: 35, color: "#14b8a6", properties: { role: "CEO", team: "Exec" } },
    ],
    edges: [{ source: "frank", target: "iris", label: "reports_to" }],
  },
  charlie: {
    nodes: [
      { id: "henry", label: "Henry", value: 20, color: "#f59e0b", properties: { role: "QA", team: "Platform" } },
    ],
    edges: [{ source: "charlie", target: "henry", label: "manages" }],
  },
};

// --- Floating Node Context Menu ---

interface NodeMenuState {
  node: GraphNode;
  x: number;
  y: number;
}

interface NodeContextMenuProps {
  menu: NodeMenuState;
  onClose: () => void;
  items: { label: string; onClick: () => void; disabled?: boolean }[];
}

function NodeContextMenu({ menu, onClose, items }: NodeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        zIndex: 9999,
        minWidth: 160,
        background: "white",
        border: "1px solid #e5e7eb",
        borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: "4px 0",
        fontSize: 13,
      }}
    >
      <div style={{ padding: "4px 12px", fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>
        {menu.node.label ?? menu.node.id}
      </div>
      {items.map((item) => (
        <button
          key={item.label}
          disabled={item.disabled}
          onClick={() => { item.onClick(); onClose(); }}
          style={{
            display: "block",
            width: "100%",
            textAlign: "left",
            padding: "6px 12px",
            background: "none",
            border: "none",
            cursor: item.disabled ? "default" : "pointer",
            color: item.disabled ? "#d1d5db" : "#111827",
          }}
          onMouseEnter={(e) => { if (!item.disabled) (e.target as HTMLElement).style.background = "#f3f4f6"; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = "none"; }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// --- Path Expansion Story ---

function PathExpansionStory() {
  const chartRef = useRef<GraphChartRef>(null);
  const [menu, setMenu] = useState<NodeMenuState | null>(null);
  const [log, setLog] = useState("Right-click a node to expand or collapse");

  const startNodes: GraphNode[] = [
    { id: "alice", label: "Alice", value: 40, color: "#3b82f6", properties: { role: "Engineer", team: "Platform" } },
    { id: "bob", label: "Bob", value: 30, color: "#22c55e", properties: { role: "Backend", team: "Platform" } },
    { id: "charlie", label: "Charlie", value: 35, color: "#ef4444", properties: { role: "Manager", team: "Platform" } },
  ];
  const startEdges: GraphEdge[] = [
    { source: "alice", target: "bob", label: "knows" },
    { source: "alice", target: "charlie", label: "colleagues" },
  ];

  const exploration = useGraphExploration({
    initialNodes: startNodes,
    initialEdges: startEdges,
    fetchNeighbors: async (node) => {
      await new Promise((r) => setTimeout(r, 400));
      const result = graphDb[node.id] ?? { nodes: [], edges: [] };
      setLog(`Expanded ${node.label}: +${result.nodes.length} nodes, +${result.edges.length} edges`);
      return result;
    },
    maxDepth: 2,
  });

  const handleRightClick = useCallback((e: GraphNodeEvent) => {
    setMenu({ node: e.node, x: e.position.x, y: e.position.y });
  }, []);

  const closeMenu = useCallback(() => setMenu(null), []);

  const menuItems = menu
    ? [
        ...(exploration.canExpand(menu.node.id)
          ? [{ label: "Expand Neighbors", onClick: () => exploration.onExpandRequest(menu.node) }]
          : []),
        ...(exploration.canCollapse(menu.node.id)
          ? [{ label: "Collapse", onClick: () => exploration.collapse(menu.node.id) }]
          : []),
        ...((menu.node.properties && Object.keys(menu.node.properties).length > 0)
          ? [{ label: "View Properties", onClick: () => setLog(`Properties: ${JSON.stringify(menu.node.properties)}`) }]
          : []),
      ]
    : [];

  return (
    <div style={{ height: 500 }}>
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button
          onClick={() => chartRef.current?.zoomToFit()}
          style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
        >
          Zoom to Fit
        </button>
        <button
          onClick={() => exploration.reset()}
          style={{ padding: "4px 12px", border: "1px solid #ccc", borderRadius: 4, fontSize: 12 }}
        >
          Reset
        </button>
        <span style={{ fontSize: 12, color: "#666" }}>
          {exploration.expandingNodeId
            ? `Loading ${exploration.expandingNodeId}...`
            : `${exploration.nodes.length} nodes, ${exploration.edges.length} edges | ${log}`}
        </span>
      </div>
      <GraphChart
        ref={chartRef}
        nodes={exploration.nodes}
        edges={exploration.edges}
        selectedNodeIds={exploration.selectedNodeIds}
        onNodeSelect={exploration.onNodeSelect}
        onNodeRightClick={handleRightClick}
        loading={exploration.expandingNodeId != null}
      />
      {menu && menuItems.length > 0 && (
        <NodeContextMenu menu={menu} onClose={closeMenu} items={menuItems} />
      )}
    </div>
  );
}

export const PathExpansion: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
  },
  render: () => <PathExpansionStory />,
};

export const NoLabels: Story = {
  args: {
    nodes: socialNodes,
    edges: socialEdges,
    showLabels: false,
  },
};

export const EmptyState: Story = {
  args: {
    nodes: [],
    edges: [],
  },
};
