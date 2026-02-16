import { useMemo, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import type { EChartsOption } from "echarts";
import { BaseChart } from "./base-chart";
import type { BaseChartProps, GraphNode, GraphEdge, GraphNodeEvent } from "./types";

export interface GraphChartRef {
  zoomToFit: () => void;
}

export interface GraphChartProps extends Omit<BaseChartProps, "options"> {
  /** Graph nodes */
  nodes: GraphNode[];
  /** Graph edges */
  edges: GraphEdge[];
  /** Layout algorithm */
  layout?: "force" | "circular";
  /** Category names for coloring nodes */
  categories?: string[];
  /** Show node labels */
  showLabels?: boolean;
  /** Controlled selection — IDs of selected nodes */
  selectedNodeIds?: string[];
  /** Toggle selection on click */
  onNodeSelect?: (ids: string[]) => void;
  /** Fired on double-click for neighbor loading */
  onExpandRequest?: (node: GraphNode) => void;
  /** Inspect / drill-down on double-click */
  onNodeDoubleClick?: (event: GraphNodeEvent) => void;
  /** Context menu on right-click (prevents browser default) */
  onNodeRightClick?: (event: GraphNodeEvent) => void;
  /** Global edge styling */
  edgeStyle?: { curveness?: number; width?: number; opacity?: number };
}

const GraphChart = forwardRef<GraphChartRef, GraphChartProps>(function GraphChart(
  {
    nodes,
    edges,
    layout = "force",
    categories,
    showLabels = true,
    selectedNodeIds,
    onNodeSelect,
    onExpandRequest,
    onNodeDoubleClick,
    onNodeRightClick,
    edgeStyle,
    onChartReady,
    onClick,
    ...rest
  },
  ref,
) {
  const instanceRef = useRef<unknown>(null);

  // Keep callback refs stable to avoid re-registering events
  const onNodeSelectRef = useRef(onNodeSelect);
  onNodeSelectRef.current = onNodeSelect;
  const onExpandRequestRef = useRef(onExpandRequest);
  onExpandRequestRef.current = onExpandRequest;
  const onNodeDoubleClickRef = useRef(onNodeDoubleClick);
  onNodeDoubleClickRef.current = onNodeDoubleClick;
  const onNodeRightClickRef = useRef(onNodeRightClick);
  onNodeRightClickRef.current = onNodeRightClick;
  const onClickRef = useRef(onClick);
  onClickRef.current = onClick;

  // Keep a ref to nodes for event handlers
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const selectedRef = useRef(selectedNodeIds);
  selectedRef.current = selectedNodeIds;

  useImperativeHandle(ref, () => ({
    zoomToFit: () => {
      const inst = instanceRef.current as { dispatchAction?: (action: unknown) => void } | null;
      inst?.dispatchAction?.({ type: "restore" });
    },
  }));

  const handleChartReady = useCallback((instance: unknown) => {
    instanceRef.current = instance;
    const inst = instance as {
      on?: (event: string, handler: (params: unknown) => void) => void;
      getZr?: () => { on?: (event: string, handler: (params: unknown) => void) => void };
    };

    // Double-click handler
    inst?.on?.("dblclick", (params: unknown) => {
      const p = params as { dataType?: string; data?: { id?: string }; event?: { offsetX?: number; offsetY?: number } };
      if (p.dataType !== "node" || !p.data?.id) return;
      const node = nodesRef.current.find((n) => n.id === p.data?.id);
      if (!node) return;
      const position = { x: p.event?.offsetX ?? 0, y: p.event?.offsetY ?? 0 };
      onNodeDoubleClickRef.current?.({ node, position });
      onExpandRequestRef.current?.(node);
    });

    // Right-click (contextmenu) handler — uses clientX/clientY for menu positioning
    inst?.on?.("contextmenu", (params: unknown) => {
      const p = params as { dataType?: string; data?: { id?: string }; event?: { event?: MouseEvent; offsetX?: number; offsetY?: number } };
      if (p.dataType !== "node" || !p.data?.id) return;
      p.event?.event?.preventDefault();
      const node = nodesRef.current.find((n) => n.id === p.data?.id);
      if (!node) return;
      const mouseEvent = p.event?.event;
      const position = {
        x: mouseEvent?.clientX ?? p.event?.offsetX ?? 0,
        y: mouseEvent?.clientY ?? p.event?.offsetY ?? 0,
      };
      onNodeRightClickRef.current?.({ node, position });
    });

    // Click handler — toggle selection + forward onClick
    inst?.on?.("click", (params: unknown) => {
      const p = params as { dataType?: string; data?: { id?: string } };
      if (p.dataType === "node" && p.data?.id && onNodeSelectRef.current) {
        const current = selectedRef.current ?? [];
        const id = p.data.id;
        const next = current.includes(id)
          ? current.filter((x) => x !== id)
          : [...current, id];
        onNodeSelectRef.current(next);
      }
    });

    onChartReady?.(instance);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-register event listeners are not needed since we use refs.
  // But we need to suppress the BaseChart's own click handler so we
  // wire it ourselves via onChartReady above.

  const selectedSet = useMemo(
    () => new Set(selectedNodeIds ?? []),
    [selectedNodeIds],
  );

  const options = useMemo((): EChartsOption => {
    if (!nodes.length) {
      return { title: { text: "No data", left: "center", top: "center", textStyle: { color: "#999", fontSize: 14 } } };
    }

    const categoryList = categories?.map((name) => ({ name })) ?? [];

    return {
      tooltip: {
        trigger: "item",
        formatter: (params: unknown) => {
          const p = params as { dataType?: string; name?: string; data?: { nodeLabel?: string; value?: number; properties?: Record<string, unknown> } };
          if (p.dataType === "node") {
            const title = p.data?.nodeLabel ?? p.name ?? "";
            const props = p.data?.properties;
            if (props && Object.keys(props).length > 0) {
              const lines = Object.entries(props)
                .map(([k, v]) => `<b>${k}:</b> ${String(v)}`)
                .join("<br/>");
              return `<b>${title}</b><br/>${lines}`;
            }
            return title;
          }
          return p.name ?? "";
        },
      },
      legend: categoryList.length > 0 ? { bottom: 0, data: categories } : undefined,
      series: [
        {
          type: "graph",
          layout,
          roam: true,
          draggable: true,
          symbolSize: (value: unknown) => {
            const v = value as number | undefined;
            return v ? Math.max(20, Math.min(60, v)) : 30;
          },
          label: {
            show: showLabels,
            position: "right",
            formatter: (params: unknown) => {
              const p = params as { data?: { label?: string }; name?: string };
              return p.data?.label ?? p.name ?? "";
            },
          },
          edgeLabel: { fontSize: 10 },
          categories: categoryList.length > 0 ? categoryList : undefined,
          data: nodes.map((n) => ({
            id: n.id,
            name: n.label ?? n.id,
            value: n.value,
            nodeLabel: n.label,
            properties: n.properties,
            category: n.category,
            symbolSize: n.value ? Math.max(20, Math.min(60, n.value)) : 30,
            fixed: n.fixed,
            x: n.x,
            y: n.y,
            itemStyle: {
              ...(n.color ? { color: n.color } : {}),
              ...(selectedSet.has(n.id)
                ? { borderColor: "#3b82f6", borderWidth: 3, shadowBlur: 10, shadowColor: "rgba(59,130,246,0.5)" }
                : {}),
            },
          } as Record<string, unknown>)),
          edges: edges.map((e) => ({
            source: e.source,
            target: e.target,
            value: e.value,
            label: e.label ? { show: true, formatter: () => e.label! } : undefined,
            lineStyle: e.color ? { color: e.color } : undefined,
          })),
          force: layout === "force"
            ? { repulsion: 200, edgeLength: [80, 200], gravity: 0.1 }
            : undefined,
          emphasis: {
            focus: "adjacency" as const,
            lineStyle: { width: 4 },
          },
          lineStyle: {
            curveness: edgeStyle?.curveness ?? 0.1,
            ...(edgeStyle?.width != null ? { width: edgeStyle.width } : {}),
            ...(edgeStyle?.opacity != null ? { opacity: edgeStyle.opacity } : {}),
          },
        },
      ],
    };
  }, [nodes, edges, layout, categories, showLabels, selectedSet, edgeStyle]);

  return <BaseChart options={options} onChartReady={handleChartReady} {...rest} />;
});

export { GraphChart };
