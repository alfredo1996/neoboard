import {
  memo,
  type ReactNode,
  useMemo,
  useRef,
  useState,
  useCallback,
  useEffect,
} from "react";
import { InteractiveNvlWrapper } from "@neo4j-nvl/react";
import type { InteractiveNvlWrapperProps } from "@neo4j-nvl/react";
import type NVL from "@neo4j-nvl/base";
import type {
  Node as NvlNode,
  Relationship as NvlRelationship,
} from "@neo4j-nvl/base";
import type {
  GraphNode,
  GraphEdge,
  GraphNodeEvent,
  GraphEdgeEvent,
} from "./types";
import type { StylingRule } from "./styling-rule";
import { resolveStylingRuleColor } from "./styling-rule";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { useDarkMode } from "./base-chart";
import { HASTINGS_LIGHT, HASTINGS_DARK } from "./theme";
import { toNvlColor } from "./nvl-color";

export type GraphLayout = "force" | "circular" | "hierarchical";

/**
 * Node-label palettes — the Hastings chart palette (#2226), the default of every
 * other chart, so the graph reads as part of the same system. Light/dark
 * variants track the theme (#2229).
 */
const LABEL_COLOR_PALETTE_LIGHT = HASTINGS_LIGHT;
const LABEL_COLOR_PALETTE_DARK = HASTINGS_DARK;

/** Hairline relationships in the rule colour of each theme (#2229). */
const EDGE_RULE_LIGHT = "#c9ced8";
const EDGE_RULE_DARK = "#6a7180";

/** The label a node is coloured and counted by: its last one. */
function colorLabel(node: GraphNode): string | undefined {
  return node.labels?.[node.labels.length - 1];
}

/** Nodes per colour label, sorted by label — the legend rows. */
function countByLabel(nodes: GraphNode[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const n of nodes) {
    const l = colorLabel(n);
    if (l !== undefined) counts.set(l, (counts.get(l) ?? 0) + 1);
  }
  return Array.from(counts).sort((a, b) => a[0].localeCompare(b[0]));
}

/**
 * Builds a map of node label → palette color.
 * Labels are sorted so the same set of labels always yields the same colors.
 */
function buildLabelColorMap(
  nodes: GraphNode[],
  dark: boolean,
): Map<string, string> {
  const palette = dark ? LABEL_COLOR_PALETTE_DARK : LABEL_COLOR_PALETTE_LIGHT;
  const labels = new Set<string>();
  for (const node of nodes) {
    if (node.labels) {
      for (const lbl of node.labels) labels.add(lbl);
    }
  }
  const sorted = Array.from(labels).sort((a, b) => a.localeCompare(b));
  const map = new Map<string, string>();
  sorted.forEach((lbl, i) => {
    // NVL only renders hex; the citrine palette is authored in hsl() (#1157).
    map.set(lbl, toNvlColor(palette[i % palette.length]));
  });
  return map;
}

export type GraphNodeSize = "small" | "medium" | "large";

/** Maps nodeSize option to a pixel multiplier for the base NVL node size. */
const NODE_SIZE_SCALE: Record<GraphNodeSize, number> = {
  small: 0.6,
  medium: 1.0,
  large: 1.6,
};

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
  /** Show relationship/edge type labels */
  showRelationshipLabels?: boolean;
  /** Node size preset */
  nodeSize?: GraphNodeSize;
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
  /** Fired when a relationship (edge) is clicked */
  onRelationshipClick?: (event: GraphEdgeEvent) => void;
  /** Called whenever the user changes the layout */
  onLayoutChange?: (layout: GraphLayout) => void;
  /** Called whenever the user changes a caption mapping */
  onCaptionMapChange?: (captionMap: Record<string, string>) => void;
  /**
   * When true, triggers a fit-to-viewport after mount with a short delay.
   * Useful when the container size may change after initial render (e.g. fullscreen dialogs).
   */
  autoFit?: boolean;
  /**
   * Show the "N nodes, M edges" overlay pill (top-left). Default true.
   *
   * A consumer that renders its own status bar passes false — otherwise the
   * same counts appear twice in one widget, which is what
   * `graph-exploration-wrapper` did until #1521. Opt-out rather than removal:
   * the chart is also rendered bare (a graph widget with no connectionId),
   * where the pill is the only count there is.
   */
  showNodeCount?: boolean;
  /**
   * Content for the bottom row, shared with the legend so the two never
   * overlap (a consumer's status bar, for one).
   */
  footer?: ReactNode;
  /** Rule-based styling rules for node color/size */
  stylingRules?: StylingRule[];
  /** Resolved parameter values for styling rule evaluation */
  paramValues?: Record<string, unknown>;
  /** Additional CSS classes */
  className?: string;
}

/**
 * NVL layout names for each of our public layout identifiers.
 *
 * "force" is NVL's CPU `d3Force`, not its WebGL `forceDirected`. For graphs of
 * up to 100 nodes `forceDirected` runs a CoseBilkent pre-layout and then steps
 * its GPU physics in a blocking loop, reading back a 256x256 float texture
 * with `gl.readPixels` on every step. That is hundreds of synchronous GPU
 * stalls in one main-thread task: ~1.2 s per mount on software GL locally,
 * ~8 s on a loaded CI runner, and nothing paints meanwhile (#1777). NVL
 * deprecates that path in favour of `d3Force` for small datasets, and uses
 * `d3Force` itself when WebGL compute is unavailable.
 *
 * Above 100 nodes the blocking loop does not run, but `d3Force` is still the
 * cheaper choice, so there is no size split. Measured on hardware GL (Apple M1
 * Max, headed Chromium), main-thread long tasks over 10 s:
 * - 1,200 nodes: forceDirected 4.7-5.2 s total with ~550 readbacks;
 *   d3Force 1.4-1.9 s. d3Force's longest single task is 0.4-0.8 s against
 *   0.3-0.4 s.
 * - 6,000 nodes: forceDirected 11.1-11.4 s total, longest task 0.55-0.63 s;
 *   d3Force 6.8-7.0 s, longest task 0.44-0.45 s.
 * The arrangement differs from forceDirected's. Stored settings still say
 * "force", so nothing migrates.
 */
function toNvlLayout(
  layout: GraphLayout,
): "d3Force" | "circular" | "hierarchical" {
  if (layout === "circular") return "circular";
  if (layout === "hierarchical") return "hierarchical";
  return "d3Force";
}

const LAYOUT_LABELS: Record<GraphLayout, string> = {
  force: "Force",
  circular: "Circular",
  hierarchical: "Hierarchical",
};

/**
 * Scans nodes to build a map of node label → available property keys.
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
    result.set(
      lbl,
      Array.from(set).sort((a, b) => a.localeCompare(b)),
    );
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
 * Converts a property value to a human-readable string for graph display.
 * Every value arrives as the row value contract's own forms (#1904) — ISO-8601
 * strings for temporals, decimal strings past a double — so a `Date` cannot
 * reach here.
 */
function graphPrimitiveString(val: unknown): string {
  if (val === null || val === undefined) return "";
  if (typeof val !== "object") return String(val);
  return JSON.stringify(val);
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
      if (val !== null && val !== undefined) return graphPrimitiveString(val);
    }
  }
  return node.label ?? node.id;
}

/**
 * The colour a node is painted: styling rule > explicit node.color > label
 * palette, as hex (NVL doesn't render hsl(), whatever the source, #1157).
 * The legend reads this too, so its swatches match the canvas.
 */
function nodeColor(
  node: GraphNode,
  labelColorMap: Map<string, string>,
  stylingRules?: StylingRule[],
  paramValues?: Record<string, unknown>,
): string | undefined {
  const ruleColor =
    stylingRules?.length && node.value != null
      ? resolveStylingRuleColor(node.value, stylingRules, paramValues)
      : undefined;
  const label = colorLabel(node);
  const raw =
    ruleColor ??
    node.color ??
    (label === undefined ? undefined : labelColorMap.get(label));
  return raw === undefined ? undefined : toNvlColor(raw);
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
  nodeSizeScale: number,
  selectedIds: Set<string>,
  stylingRules?: StylingRule[],
  paramValues?: Record<string, unknown>,
): NvlNode {
  let x = node.x;
  let y = node.y;
  if (x === undefined && y === undefined) {
    const angle = (2 * Math.PI * index) / Math.max(total, 1);
    const radius = Math.max(150, total * 30);
    x = Math.cos(angle) * radius;
    y = Math.sin(angle) * radius;
  }

  const color = nodeColor(node, labelColorMap, stylingRules, paramValues);

  // Size: base from node.value, scaled by nodeSizeScale
  let baseSize: number | undefined;
  if (node.value) baseSize = Math.max(20, Math.min(60, node.value));

  const caption = showLabels ? resolveCaption(node, captionMap) : undefined;

  // A synthetic node gets a second, italic caption line so it reads as
  // "computed, not stored" at a glance. NVL exposes no border or stroke
  // styling, so the dashed outline that usually signals this is not available;
  // a caption is text, so it inherits NVL's own contrast handling and stays
  // legible on both the light and dark canvas.
  // The marker survives showLabels=false on purpose — "this is not a real
  // node" is not a label, and hiding it there would restore the exact silent
  // ambiguity this fixes.
  // ponytail: caption-only. A real dashed ring needs a custom NVL renderer;
  // revisit if NVL ever exposes stroke styling.
  const captions = node.synthetic
    ? [
        ...(caption === undefined ? [] : [{ value: caption }]),
        { value: "virtual", styles: ["italic"] },
      ]
    : undefined;

  return {
    id: node.id,
    caption,
    captions,
    color,
    size:
      baseSize !== undefined ? Math.round(baseSize * nodeSizeScale) : undefined,
    pinned: node.fixed,
    // Reflect controlled selection so NVL highlights selected nodes (e.g. a
    // restored or programmatic selection, not just the last in-canvas click).
    selected: selectedIds.has(node.id),
    x,
    y,
  };
}

const TOOLTIP_W = 224; // max-w-56
const TOOLTIP_H = 48; // two truncated 12px/16px lines + padding

/** Offset from the pointer, clamped so the tooltip stays inside the container. */
function tooltipPos(x: number, y: number, box: HTMLElement | null) {
  const w = box?.clientWidth || Infinity;
  const h = box?.clientHeight || Infinity;
  return {
    left: Math.max(0, Math.min(x + 12, w - TOOLTIP_W)),
    top: Math.max(0, Math.min(y + 12, h - TOOLTIP_H)),
  };
}

function edgeColor(color: string | undefined, dark: boolean): string {
  if (color) return toNvlColor(color);
  return dark ? EDGE_RULE_DARK : EDGE_RULE_LIGHT;
}

/**
 * Maps our internal GraphEdge type to an NVL Relationship.
 */
function toNvlRelationship(
  edge: GraphEdge,
  index: number,
  showRelationshipLabels: boolean,
  dark: boolean,
): NvlRelationship {
  return {
    id: `rel-${edge.source}-${edge.target}-${index}`,
    from: edge.source,
    to: edge.target,
    caption: showRelationshipLabels ? edge.label : undefined,
    type: edge.label,
    // NVL's default relationship grey nearly vanishes on the dark canvas
    // (#1154) — give uncolored edges an explicit mid-grey in dark mode.
    // Normalize to hex either way; NVL doesn't render hsl() (#1157).
    color: edgeColor(edge.color, dark),
    width: 1,
  };
}

/**
 * GraphChart — renders a property graph with NVL (`@neo4j-nvl/react`).
 *
 * Features a built-in overlay toolbar (top-right) with:
 * - Fit button: re-centers and fits the graph in the viewport
 * - Layout dropdown: switch between Force, Circular, and Hierarchical layouts
 * - Label settings: per-label property selector for node captions
 *
 * Wrapped in React.memo — the component is expensive (NVL simulation + heavy
 * useMemo work) and parents often re-render for unrelated reasons. Memoization
 * skips re-renders when props are referentially stable.
 */
function GraphChartInner({
  nodes,
  edges,
  layout: layoutProp = "force",
  initialLayout,
  showLabels = true,
  showRelationshipLabels = false,
  nodeSize = "medium",
  initialCaptionMap,
  selectedNodeIds,
  onNodeSelect,
  onExpandRequest,
  onNodeDoubleClick,
  onNodeRightClick,
  onRelationshipClick,
  onLayoutChange,
  onCaptionMapChange,
  autoFit,
  showNodeCount = true,
  footer,
  stylingRules,
  paramValues,
  className,
}: GraphChartProps) {
  const nvlRef = useRef<NVL>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{
    title: string;
    sub: string;
    x: number;
    y: number;
  } | null>(null);
  const [layoutReady, setLayoutReady] = useState(false);
  const [layout, setLayout] = useState<GraphLayout>(
    initialLayout ?? layoutProp,
  );
  const dark = useDarkMode();

  // Reset layoutReady synchronously during render when nodes change.
  // Using useEffect would race with onLayoutDone (which fires before
  // effects run when the simulation completes on the main thread).
  const prevNodesRef = useRef(nodes);
  if (prevNodesRef.current !== nodes) {
    prevNodesRef.current = nodes;
    if (layoutReady) setLayoutReady(false);
  }

  // Build the label → property keys map from current nodes
  const labelPropertyMap = useMemo(() => buildLabelPropertyMap(nodes), [nodes]);

  // Build the label → color map for palette-based coloring (theme-aware)
  const labelColorMap = useMemo(
    () => buildLabelColorMap(nodes, dark),
    [nodes, dark],
  );

  const legendRows = useMemo(() => countByLabel(nodes), [nodes]);
  // Per label, the distinct colours its nodes are painted with.
  const legendColors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const n of nodes) {
      const l = colorLabel(n);
      const c = nodeColor(n, labelColorMap, stylingRules, paramValues);
      if (l === undefined || c === undefined) continue;
      m.set(l, (m.get(l) ?? new Set()).add(c));
    }
    return m;
  }, [nodes, labelColorMap, stylingRules, paramValues]);

  // Caption map: node label → chosen property key for display
  const [captionMap, setCaptionMap] = useState<Record<string, string>>(
    initialCaptionMap ?? {},
  );

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
  const onRelationshipClickRef = useRef(onRelationshipClick);
  onRelationshipClickRef.current = onRelationshipClick;

  const captionMapRef = useRef(captionMap);
  captionMapRef.current = captionMap;
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;
  const selectedRef = useRef(selectedNodeIds);
  selectedRef.current = selectedNodeIds;

  const nodeSizeScale = NODE_SIZE_SCALE[nodeSize] ?? 1.0;

  const selectedIds = useMemo(
    () => new Set(selectedNodeIds ?? []),
    [selectedNodeIds],
  );

  const nvlNodes = useMemo(
    () =>
      nodes.map((n, i) =>
        toNvlNode(
          n,
          i,
          nodes.length,
          showLabels,
          captionMap,
          labelColorMap,
          nodeSizeScale,
          selectedIds,
          stylingRules,
          paramValues,
        ),
      ),
    [
      nodes,
      showLabels,
      captionMap,
      labelColorMap,
      nodeSizeScale,
      selectedIds,
      stylingRules,
      paramValues,
    ],
  );

  const nvlRels = useMemo(
    () =>
      edges.map((e, i) =>
        toNvlRelationship(e, i, showRelationshipLabels, dark),
      ),
    [edges, showRelationshipLabels, dark],
  );

  const fitGraph = useCallback((options?: { animated: boolean }) => {
    if (nvlRef.current) {
      nvlRef.current.fit(
        nodesRef.current.map((n) => n.id),
        options,
      );
    }
  }, []);

  /** Multiplier applied to the current zoom level on each zoom button press. */
  const ZOOM_STEP = 1.25;

  const zoomIn = useCallback(() => {
    const nvl = nvlRef.current;
    if (!nvl) return;
    const current = nvl.getScale();
    nvl.setZoom(current * ZOOM_STEP);
  }, []);

  const zoomOut = useCallback(() => {
    const nvl = nvlRef.current;
    if (!nvl) return;
    const current = nvl.getScale();
    nvl.setZoom(current / ZOOM_STEP);
  }, []);

  // When autoFit is true, fit the graph after layout has settled.
  // layoutReady flips to true when onLayoutDone fires — deterministic,
  // not based on an arbitrary timer.
  useEffect(() => {
    if (!autoFit || !layoutReady) return;
    fitGraph();
  }, [autoFit, layoutReady, fitGraph]);

  const mouseEventCallbacks = useMemo(
    (): InteractiveNvlWrapperProps["mouseEventCallbacks"] => ({
      onHover: (element, _hit, event) => {
        const box = containerRef.current?.getBoundingClientRect();
        const { left: x, top: y } = tooltipPos(
          (event?.clientX ?? 0) - (box?.left ?? 0),
          (event?.clientY ?? 0) - (box?.top ?? 0),
          containerRef.current,
        );
        if (!element) return setHover(null);
        if ("from" in element) {
          const name = (id: string) => {
            const n = nodesRef.current.find((c) => c.id === id);
            return n ? resolveCaption(n, captionMapRef.current) : id;
          };
          return setHover({
            title: `${name(element.from)} → ${name(element.to)}`,
            sub: element.type ?? "",
            x,
            y,
          });
        }
        const node = nodesRef.current.find((c) => c.id === element.id);
        if (!node) return setHover(null);
        setHover({
          title: resolveCaption(node, captionMapRef.current),
          sub: colorLabel(node) ?? "",
          x,
          y,
        });
      },
      onDrag: true,
      onZoom: true,
      onPan: true,
      onNodeClick: (node, _hit, event) => {
        if (!onNodeSelectRef.current) return;
        const current = selectedRef.current ?? [];
        const id = node.id;
        // Cmd/Ctrl toggles a node in/out of a multi-selection (the file-manager
        // and graph-browser convention); Shift is accepted too — it is what plenty
        // of people reach for first and nothing else in this widget claims it
        // (the box-select and lasso interactions are not wired up). A plain
        // click REPLACES the selection, so stepping through nodes one at a time
        // keeps the single-node property inspector reachable (#1191).
        // `event` is optional-chained only for callers that omit it; NVL always
        // passes a MouseEvent as the third argument.
        const additive = !!(
          event?.metaKey ||
          event?.ctrlKey ||
          event?.shiftKey
        );
        let next: string[];
        if (additive) {
          next = current.includes(id)
            ? current.filter((x) => x !== id)
            : [...current, id];
        } else {
          // Clicking the already-sole-selected node clears the selection.
          next = current.length === 1 && current[0] === id ? [] : [id];
        }
        onNodeSelectRef.current(next);
      },
      onNodeDoubleClick: (node, _hit, event) => {
        const graphNode = nodesRef.current.find((n) => n.id === node.id) ?? {
          id: node.id,
        };
        onExpandRequestRef.current?.(graphNode as GraphNode);
        onNodeDoubleClickRef.current?.({
          node: graphNode as GraphNode,
          position: { x: event.clientX, y: event.clientY },
        });
      },
      onNodeRightClick: (node, _hit, event) => {
        if (!onNodeRightClickRef.current) return;
        event.preventDefault();
        const graphNode = nodesRef.current.find((n) => n.id === node.id) ?? {
          id: node.id,
        };
        onNodeRightClickRef.current({
          node: graphNode,
          position: { x: event.clientX, y: event.clientY },
        });
      },
      onRelationshipClick: (
        rel: NvlRelationship,
        _hit: unknown,
        event: MouseEvent,
      ) => {
        if (!onRelationshipClickRef.current) return;
        const graphEdge = edgesRef.current.find(
          (e) => e.source === rel.from && e.target === rel.to,
        ) ?? { source: rel.from, target: rel.to, label: rel.type };
        onRelationshipClickRef.current({
          edge: graphEdge as GraphEdge,
          position: { x: event.clientX, y: event.clientY },
        });
      },
    }),
    [],
  );

  const nvlCallbacks = useMemo(
    () => ({
      onLayoutDone: () => {
        fitGraph();
        setLayoutReady(true);
      },
    }),
    [fitGraph],
  );

  const nvlOptions = useMemo(
    () => ({
      allowDynamicMinZoom: true,
      initialZoom: 0.7,
      // Web workers require bundler-specific config in Next.js; keep on main thread.
      disableWebWorkers: true,
      // NVL's built-in Segment analytics is on unless turned off (#2229).
      disableTelemetry: true,
    }),
    [],
  );

  const hasLabels = labelPropertyMap.size > 0;

  // Refit when the panel is resized (maximise, grid drag, window).
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    // A drag fires this every frame; fit once, instantly, when it settles.
    // NVL's fit takes no duration, only animated: false (its animation is the
    // slow part), so a resize snaps instead of easing.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => fitGraph({ animated: false }), 150);
    });
    ro.observe(el);
    return () => {
      clearTimeout(timer);
      ro.disconnect();
    };
  }, [fitGraph, nodes.length]);

  // Safety timeout: if NVL's onLayoutDone never fires (e.g. when the component
  // mounts inside a CSS-animated dialog where the container starts at ~0 size),
  // force layoutReady after a short delay so the loading spinner doesn't persist
  // indefinitely.  When onLayoutDone fires normally this timeout is a no-op
  // because the state is already true.
  useEffect(() => {
    if (layoutReady || nodes.length === 0) return;
    const timer = setTimeout(() => {
      setLayoutReady(true);
      fitGraph();
    }, 800);
    return () => clearTimeout(timer);
  }, [layoutReady, nodes.length, fitGraph]);

  if (!nodes.length) {
    return (
      <div
        className={`flex h-full w-full items-center justify-center bg-muted/20 rounded ${className ?? ""}`}
      >
        <div className="text-center text-muted-foreground p-6">
          <p className="text-sm font-medium">No graph data</p>
          <p className="text-xs mt-1">
            Query must return nodes and relationships. Return the graph elements
            themselves, not only their properties.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`group/graph relative h-full w-full ${className ?? ""}`}
      onMouseLeave={() => setHover(null)}
    >
      {/* Node count display (top-left) — suppressed by a consumer that renders
          its own status bar, so the counts never appear twice (#1521). */}
      {showNodeCount && (
        <div
          className="absolute top-2 left-2 z-10 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
          data-testid="graph-node-count"
        >
          {nodes.length} {nodes.length === 1 ? "node" : "nodes"}, {edges.length}{" "}
          {edges.length === 1 ? "edge" : "edges"}
        </div>
      )}

      {/* Overlay toolbar */}
      <div
        role="toolbar"
        aria-label="Graph controls"
        className="absolute top-2 right-2 z-10 flex items-center gap-1 rounded-md border border-border/50 bg-background/80 px-1.5 py-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity focus-within:opacity-100 group-hover/graph:opacity-100 group-focus-within/graph:opacity-100 [@media(hover:none)]:opacity-100"
      >
        <button
          onClick={zoomIn}
          className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Zoom in"
          aria-label="Zoom in"
          data-testid="graph-zoom-in"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M7 4v6M4 7h6M11 11l3 3" />
          </svg>
        </button>
        <button
          onClick={zoomOut}
          className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Zoom out"
          aria-label="Zoom out"
          data-testid="graph-zoom-out"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <circle cx="7" cy="7" r="5" />
            <path d="M4 7h6M11 11l3 3" />
          </svg>
        </button>
        <button
          onClick={() => fitGraph()}
          className="flex h-6 w-6 items-center justify-center rounded text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          title="Fit graph"
          aria-label="Fit graph"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M1 5V2h3M12 2h3v3M15 11v3h-3M4 14H1v-3" />
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
            <option key={key} value={key}>
              {LAYOUT_LABELS[key]}
            </option>
          ))}
        </select>
        {hasLabels && (
          <>
            <div className="h-4 w-px bg-border/60" />
            <Popover>
              <PopoverTrigger asChild>
                <button
                  className="flex h-6 items-center justify-center rounded px-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  title="Label settings"
                  aria-label="Label settings"
                  data-testid="label-settings-button"
                >
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 16 16"
                    className="h-3.5 w-3.5"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                  >
                    <path d="M6 2h4l1 3h3l-2 3 2 3H11l-1 3H6L5 11H2l2-3-2-3h3z" />
                  </svg>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-56 p-3"
                data-testid="label-settings-panel"
              >
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Node captions
                </div>
                {Array.from(labelPropertyMap.entries()).map(
                  ([lbl, propKeys]) => (
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
                          <option key={key} value={key}>
                            {key}
                          </option>
                        ))}
                      </select>
                    </div>
                  ),
                )}
              </PopoverContent>
            </Popover>
          </>
        )}
      </div>

      {(legendRows.length > 0 || footer) && (
        <div className="pointer-events-none absolute bottom-2 left-2 right-2 z-10 flex flex-wrap items-end gap-2">
          {footer && <div className="pointer-events-auto">{footer}</div>}
          {legendRows.length > 0 && (
            <ul
              className="pointer-events-auto m-0 flex list-none flex-wrap gap-x-3 gap-y-1 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs text-muted-foreground backdrop-blur-sm"
              data-testid="graph-legend"
            >
              {legendRows.map(([lbl, count]) => {
                const colors = Array.from(legendColors.get(lbl) ?? []);
                const mixed = colors.length > 1;
                return (
                  <li key={lbl} className="inline-flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      // Mixed: a conic split of the colours in use, not one
                      // misleading swatch.
                      style={
                        mixed
                          ? {
                              backgroundImage: `conic-gradient(${colors
                                .map(
                                  (c, i, all) =>
                                    `${c} ${(i / all.length) * 100}% ${((i + 1) / all.length) * 100}%`,
                                )
                                .join(", ")})`,
                            }
                          : { backgroundColor: colors[0] }
                      }
                      data-mixed={mixed ? "true" : undefined}
                      data-testid={`graph-legend-swatch-${lbl}`}
                      aria-hidden="true"
                    />
                    {lbl}{" "}
                    <span data-testid={`graph-legend-count-${lbl}`}>
                      {count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-30 max-w-56 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md"
          style={{ left: hover.x, top: hover.y }}
          data-testid="graph-hover"
        >
          <div className="truncate font-medium">{hover.title}</div>
          {hover.sub && (
            <div className="truncate text-muted-foreground">{hover.sub}</div>
          )}
        </div>
      )}

      {!layoutReady && nodes.length > 0 && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/60 backdrop-blur-[1px]"
          data-testid="graph-loading-overlay"
        >
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      )}

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

export const GraphChart = memo(GraphChartInner);
GraphChart.displayName = "GraphChart";
