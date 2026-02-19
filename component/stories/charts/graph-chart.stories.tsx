import { useState, useEffect, useRef } from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { GraphChart } from "@/charts/graph-chart";
import type { GraphNode, GraphEdge } from "@/charts/types";
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
      { id: "alice", label: "Alice", value: 40, color: "#3b82f6" },
      { id: "bob", label: "Bob", value: 30, color: "#3b82f6" },
      { id: "acme", label: "Acme Corp", value: 50, color: "#a855f7" },
      { id: "globex", label: "Globex", value: 45, color: "#a855f7" },
      { id: "charlie", label: "Charlie", value: 35, color: "#3b82f6" },
    ],
    edges: [
      { source: "alice", target: "acme", label: "works_at" },
      { source: "bob", target: "globex", label: "works_at" },
      { source: "charlie", target: "acme", label: "works_at" },
      { source: "alice", target: "bob", label: "knows" },
    ],
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

export const ColoredEdges: Story = {
  args: {
    nodes: socialNodes,
    edges: [
      { source: "alice", target: "bob", label: "friends", color: "#3b82f6" },
      { source: "alice", target: "charlie", label: "colleagues", color: "#22c55e" },
      { source: "bob", target: "diana", label: "friends", color: "#3b82f6" },
      { source: "charlie", target: "diana", label: "manages", color: "#f59e0b" },
      { source: "diana", target: "eve", label: "mentors", color: "#a855f7" },
      { source: "eve", target: "alice", label: "reports_to", color: "#ef4444" },
    ],
  },
};

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

// --- Path Expansion Story ---

interface NodeMenu {
  node: GraphNode;
  x: number;
  y: number;
}

function NodeContextMenu({ menu, onClose, onExpand, onCollapse }: {
  menu: NodeMenu;
  onClose: () => void;
  onExpand?: () => void;
  onCollapse?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const items = [
    onExpand && { label: "Expand neighbors", action: onExpand },
    onCollapse && { label: "Collapse", action: onCollapse },
  ].filter(Boolean) as { label: string; action: () => void }[];

  return (
    <div
      ref={ref}
      style={{
        position: "fixed", left: menu.x, top: menu.y, zIndex: 9999,
        background: "white", border: "1px solid #e5e7eb", borderRadius: 6,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)", padding: "4px 0", minWidth: 160, fontSize: 13,
      }}
    >
      <div style={{ padding: "4px 12px 6px", fontSize: 11, color: "#9ca3af", fontWeight: 500, borderBottom: "1px solid #f3f4f6" }}>
        {menu.node.label ?? menu.node.id}
      </div>
      {items.length === 0 && (
        <div style={{ padding: "6px 12px", color: "#9ca3af", fontSize: 12 }}>No actions</div>
      )}
      {items.map((item) => (
        <button
          key={item.label}
          onClick={() => { item.action(); onClose(); }}
          style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 12px", background: "none", border: "none", cursor: "pointer", color: "#111827" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "#f3f4f6"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "none"; }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function PathExpansionStory() {
  const [log, setLog] = useState("Right-click a node to expand or collapse");
  const [menu, setMenu] = useState<NodeMenu | null>(null);

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

  return (
    <div style={{ height: 500 }}>
      <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
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
        nodes={exploration.nodes}
        edges={exploration.edges}
        selectedNodeIds={exploration.selectedNodeIds}
        onNodeSelect={exploration.onNodeSelect}
        onNodeRightClick={(e) => setMenu({ node: e.node, x: e.position.x, y: e.position.y })}
      />
      {menu && (
        <NodeContextMenu
          menu={menu}
          onClose={() => setMenu(null)}
          onExpand={exploration.canExpand(menu.node.id)
            ? () => exploration.onExpandRequest(menu.node)
            : undefined}
          onCollapse={exploration.canCollapse(menu.node.id)
            ? () => exploration.collapse(menu.node.id)
            : undefined}
        />
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

export const WithLabelSelector: Story = {
  args: {
    nodes: [
      { id: "p1", label: "Tom Hanks", labels: ["Person"], value: 40, color: "#3b82f6", properties: { name: "Tom Hanks", born: 1956, role: "Actor" } },
      { id: "p2", label: "Keanu Reeves", labels: ["Person"], value: 35, color: "#3b82f6", properties: { name: "Keanu Reeves", born: 1964, role: "Actor" } },
      { id: "p3", label: "Carrie-Anne Moss", labels: ["Person"], value: 30, color: "#3b82f6", properties: { name: "Carrie-Anne Moss", born: 1967, role: "Actress" } },
      { id: "m1", label: "The Matrix", labels: ["Movie"], value: 50, color: "#a855f7", properties: { title: "The Matrix", released: 1999, tagline: "Welcome to the Real World" } },
      { id: "m2", label: "Forrest Gump", labels: ["Movie"], value: 45, color: "#a855f7", properties: { title: "Forrest Gump", released: 1994, tagline: "Life is like a box of chocolates" } },
    ],
    edges: [
      { source: "p2", target: "m1", label: "ACTED_IN" },
      { source: "p3", target: "m1", label: "ACTED_IN" },
      { source: "p1", target: "m2", label: "ACTED_IN" },
    ],
  },
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
