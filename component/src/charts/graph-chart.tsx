import { useMemo, useRef, useState, useCallback, useEffect } from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { InteractiveNvlWrapperProps } from "@neo4j-nvl/react";
import type NVL from "@neo4j-nvl/base";
import type { Node as NvlNode, Relationship as NvlRelationship } from "@neo4j-nvl/base";
import type { GraphNode, GraphEdge, GraphNodeEvent } from "./types";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Label } from "@/components/ui/label";

export type GraphLayout = "force" | "circular" | "hierarchical";

/**
 * A fixed palette of visually distinct colors for label-based node coloring.
 * Labels are sorted alphabetically then assigned colors by index,
 * making the mapping deterministic across renders.
 */
const LABEL_COLOR_PALETTE = [
  "#4E79A7", "#F28E2B", "#E15759", "#76B7B2", "#59A14F",
  "#EDC948", "#B07AA1", "#FF9DA7", "#9C755F", "#BAB0AC",
];

/**
 * Builds a map of Neo4j label → palette color.
 * Labels are sorted so the same set of labels always yields the same colors.
 */
function buildLabelColorMap(nodes: GraphNode[]): Map<string, string> {
  const labels = new Set<string>();
  for (const node of nodes) {
    if (node.labels) {
      for (const lbl of node.labels) labels.add(lbl);
    }
  }
  const sorted = Array.from(labels).sort();
  const map = new Map<string, string>();
  sorted.forEach((lbl, i) => {
    map.set(lbl, LABEL_COLOR_PALETTE[i % LABEL_COLOR_PALETTE.length]);
  });
  return map;
}


export interface GraphChartProps {
  /** Graph nodes */
  nodes: GraphNode[];
  /** Graph edges */
  edges: GraphEdge[];
  /**
   * Initial layout algorithm.
   * The toolbar lets the user switch layouts at runtime.
   */
  layout?: GraphLayout;
  /** Seed the layout state (takes precedence over layout prop when provided) */
  initialLayout?: GraphLayout;
  /** Show node labels (captions) */
  showLabels?: boolean;
  /** Seed the caption map state */
  initialCaptionMap?: Record<string, string>;
  /** Controlled selection — IDs of selected nodes */
  selectedNodeIds?: string[];
  /** Toggle selection on click */
  onNodeSelect?: (ids: string[]) => void;
  /** Fired on double-click for neighbor loading */
  onExpandRequest?: (node: GraphNode) => void;
  /** Inspect / drill-down on double-click */
  onNodeDoubleClick?: (event: GraphNodeEvent) => void;
  /** Context-menu trigger — fired on right-click */
  onNodeRightClick?: (event: GraphNodeEvent) => void;
  /** Called whenever the user changes the layout */
  onLayoutChange?: (layout: GraphLayout) => void;
  /** Called whenever the user changes a caption mapping */
  onCaptionMapChange?: (captionMap: Record<string, string>) => void;
  /** Additional CSS classes */
  className?: string;
}

/** NVL layout names for each of our public layout identifiers. */
function toNvlLayout(layout: GraphLayout): "forceDirected" | "circular" | "hierarchical" {
  if (layout === "circular") return "circular";
  if (layout === "hierarchical") return "hierarchical";
  return "forceDirected";
}

const LAYOUT_LABELS: Record<GraphLayout, string> = {
  force: "Force",
  circular: "Circular",
  hierarchical: "Hierarchical",
};

/**
 * Scans nodes to build a map of Neo4j label → available property keys.
 */
function buildLabelPropertyMap(nodes: GraphNode[]): Map<string, string[]> {
  const map = new Map<string, Set<string>>();
  for (const node of nodes) {
    const nodeLabels = node.labels ?? [];
    const propKeys = node.properties ? Object.keys(node.properties) : [];
    for (const lbl of nodeLabels) {
      let set = map.get(lbl);
      if (!set) {
        set = new Set();
        map.set(lbl, set);
      }
      for (const k of propKeys) set.add(k);
    }
  }
  const result = new Map<string, string[]>();
  for (const [lbl, set] of map) {
    result.set(lbl, Array.from(set).sort());
  }
  return result;
}

/**
 * Pick a sensible default caption property for a given label's available properties.
 */
function pickDefaultCaptionProp(propKeys: string[]): string {
  const preferred = ["name", "title", "label", "username", "email"];
  for (const p of preferred) {
    if (propKeys.includes(p)) return p;
  }
  return propKeys[0] ?? "";
}

/**
 * Resolve the caption for a node given the captionMap.
 */
function resolveCaption(
  node: GraphNode,
  captionMap: Record<string, string>,
): string {
  const nodeLabels = node.labels ?? [];
  const props = node.properties ?? {};
  for (const lbl of nodeLabels) {
    const propKey = captionMap[lbl];
    if (propKey && propKey in props) {
      const val = props[propKey];
      if (val !== null && val !== undefined) return String(val);
    }
  }
  return node.label ?? node.id;
}

/**
 * Maps our internal GraphNode type to an NVL Node.
 * Color priority: explicit node.color > last-label color from palette > undefined.
 */
function toNvlNode(
  node: GraphNode,
  index: number,
  total: number,
  showLabels: boolean,
  captionMap: Record<string, string>,
  labelColorMap: Map<string, string>,
): NvlNode {
  let x = node.x;
  let y = node.y;
  if (x === undefined && y === undefined) {
    const angle = (2 * Math.PI * index) / Math.max(total, 1);
    const radius = Math.max(150, total * 30);
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
  }
  // Use the last label to determine the color (most specific label wins)
  const color = node.color ?? (node.labels?.length
    ? labelColorMap.get(node.labels[node.labels.length - 1])
    : undefined);
  return {
    id: node.id,
    caption: showLabels ? resolveCaption(node, captionMap) : undefined,
    color,
    size: node.value ? Math.max(20, Math.min(60, node.value)) : undefined,
    pinned: node.fixed,
    x,
    y,
  };
}

/**
 * Maps our internal GraphEdge type to an NVL Relationship.
 */
function toNvlRelationship(edge: GraphEdge, index: number): NvlRelationship {
  return {
    id: `rel-${edge.source}-${edge.target}-${index}`,
    from: edge.source,
    to: edge.target,
    caption: edge.label,
    type: edge.label,
    color: edge.color,
  };
}

/**
 * GraphChart — renders a Neo4j graph using the NVL (Neo4j Visualization Library).
 *
 * Features a built-in overlay toolbar (top-right) with:
 * - Fit button: re-centers and fits the graph in the viewport
 * - Layout dropdown: switch between Force, Circular, and Hierarchical layouts
 * - Label settings: per-label property selector for node captions
 */
export function GraphChart({
  nodes,
  edges,
  layout: layoutProp = "force",
  initialLayout,
  showLabels = true,
  initialCaptionMap,
  selectedNodeIds,
  onNodeSelect,
  onExpandRequest,
  onNodeDoubleClick,
  onNodeRightClick,
  onLayoutChange,
  onCaptionMapChange,
  className,
}: GraphChartProps) {
  const nvlRef = useRef<NVL>(null);
  const [layout, setLayout] = useState<GraphLayout>(initialLayout ?? layoutProp);

  // Build the label → property keys map from current nodes
  const labelPropertyMap = useMemo(() => buildLabelPropertyMap(nodes), [nodes]);

  // Build the label → color map for palette-based coloring
  const labelColorMap = useMemo(() => buildLabelColorMap(nodes), [nodes]);

  // Caption map: Neo4j label → chosen property key for display
  const [captionMap, setCaptionMap] = useState<Record<string, string>>(initialCaptionMap ?? {});

  // Initialize caption map with defaults when new labels appear
  useEffect(() => {
    setCaptionMap((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const [lbl, propKeys] of labelPropertyMap) {
        if (!(lbl in next) && propKeys.length > 0) {
          next[lbl] = pickDefaultCaptionProp(propKeys);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [labelPropertyMap]);

  // Stable refs to latest callbacks
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const onExpandRequestRef = useRef(onExpandRequest);
  onExpandRequestRef.current = onExpandRequest;
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  onNodeDoubleClickRef.current = onNodeDoubleClick;
  const onNodeRightClickRef = useRef(onNodeRightClick);
  onNodeRightClickRef.current = onNodeRightClick;

  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const selectedRef = useRef(selectedNodeIds);
  selectedRef.current = selectedNodeIds;

  const nvlNodes = useMemo(
    () => nodes.map((n, i) => toNvlNode(n, i, nodes.length, showLabels, captionMap, labelColorMap)),
    [nodes, showLabels, captionMap, labelColorMap],
  );

  const nvlRels = useMemo(
    () => edges.map((e, i) => toNvlRelationship(e, i)),
    [edges],
  );

  const fitGraph = useCallback(() => {
    if (nvlRef.current) {
      nvlRef.current.fit(nodesRef.current.map((n) => n.id));
    }
  }, []);

  const mouseEventCallbacks = useMemo((): InteractiveNvlWrapperProps["mouseEventCallbacks"] => ({
    onHover: true,
    onDrag: true,
    onZoom: true,
    onPan: true,
    onNodeClick: (node) => {
      if (!onNodeSelectRef.current) return;
      const current = selectedRef.current ?? [];
      const id = node.id;
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      onNodeSelectRef.current(next);
    },
    onNodeRightClick: (node, _hit, event) => {
      if (!onNodeRightClickRef.current) return;
      const graphNode = nodesRef.current.find((n) => n.id === node.id) ?? { id: node.id };
      onNodeRightClickRef.current({ node: graphNode, position: { x: event.clientX, y: event.clientY } });
    },
  }), []);

  const nvlCallbacks = useMemo(() => ({
    onLayoutDone: fitGraph,
  }), [fitGraph]);

  const nvlOptions = useMemo(() => ({
    allowDynamicMinZoom: true,
    initialZoom: 0.7,
    disableWebWorkers: true,
  }), []);

  const hasLabels = labelPropertyMap.size > 0;

  if (!nodes.length) {
    return (
      <div className={`flex h-full w-full items-center justify-center bg-muted/20 rounded ${className ?? ""}`}>
        <div className="text-center text-muted-foreground p-6">
          <p className="text-sm font-medium">No graph data</p>
          <p className="text-xs mt-1">
            Query must return nodes and relationships. Use Neo4j with a Cypher MATCH query.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative h-full w-full ${className ?? ""}`}>
      {/* Overlay toolbar */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border/50 bg-background/80 px-1.5 py-1 shadow-sm backdrop-blur-sm">
        <button
          onClick={fitGraph}
          className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
          title="Fit graph"
          aria-label="Fit graph"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3"/>
          </svg>
        </button>
        <div className="h-4 w-px bg-border/60" />
        <select
          value={layout}
          onChange={(e) => {
            const next = e.target.value as GraphLayout;
            setLayout(next);
            onLayoutChange?.(next);
          }}
          className="h-6 cursor-pointer rounded border-0 bg-transparent pr-4 text-xs text-muted-foreground outline-none transition-colors hover:text-foreground"
          aria-label="Graph layout"
        >
          {(Object.keys(LAYOUT_LABELS) as GraphLayout[]).map((key) => (
            <option key={key} value={key}>{LAYOUT_LABELS[key]}</option>
          ))}
        </select>
        {hasLabels && (
          <>
            <div className="h-4 w-px bg-border/60" />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex h-6 items-center justify-center rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
                  title="Label settings"
                  aria-label="Label settings"
                  data-testid="label-settings-button"
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M6 2h4l1 3h3l-2 3 2 3H11l-1 3H6L5 11H2l2-3-2-3h3z"/>
                  </svg>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-56 p-3"
                data-testid="label-settings-panel"
              >
                <div className="mb-2 text-xs font-medium text-muted-foreground">Node captions</div>
                {Array.from(labelPropertyMap.entries()).map(([lbl, propKeys]) => (
                  <div key={lbl} className="mb-2 last:mb-0">
                    <Label htmlFor={`caption-${lbl}`} className="text-xs">
                      {lbl}
                    </Label>
                    <select
                      id={`caption-${lbl}`}
                      value={captionMap[lbl] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCaptionMap((prev) => {
                          const next = { ...prev, [lbl]: val };
                          onCaptionMapChange?.(next);
                          return next;
                        });
                      }}
                      className="mt-0.5 w-full h-7 cursor-pointer rounded border bg-background px-2 text-xs outline-none"
                      aria-label={`Caption property for ${lbl}`}
                      data-testid={`caption-select-${lbl}`}
                    >
                      {propKeys.map((key) => (
                        <option key={key} value={key}>{key}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      <InteractiveNvlWrapper
        ref={nvlRef}
        nodes={nvlNodes}
        rels={nvlRels}
        layout={toNvlLayout(layout)}
        mouseEventCallbacks={mouseEventCallbacks}
        nvlCallbacks={nvlCallbacks}
        nvlOptions={nvlOptions}
      />
    </div>
  );
}
