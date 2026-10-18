import { connectorLabel } from "@/lib/connector/connector-label";

type Labelled = readonly { type: string; label: string }[];

/** "Reusable widgets … · N templates" (the mock's page meta, #2254). */
export function templateListMeta(count: number): string {
  return `Reusable widgets you can drop into any dashboard · ${count} ${count === 1 ? "template" : "templates"}`;
}

/**
 * The connection column: the connection the template is bound to, else "Any
 * ‹connector label› connection" (owner, 2026-10-18). A template with neither
 * (a content widget) has none to show. A bound connection the viewer cannot
 * list reads as unavailable rather than as "any".
 */
export function templateConnectionLabel(
  template: { connectionId?: string | null; connectorType?: string | null },
  connections: readonly { id: string; name: string }[],
  connectors: Labelled,
): string {
  if (template.connectionId) {
    return (
      connections.find((c) => c.id === template.connectionId)?.name ??
      "Connection not available"
    );
  }
  if (!template.connectorType) return "—";
  return `Any ${connectorLabel(connectors, template.connectorType)} connection`;
}

export interface TemplateFilterState {
  search: string;
  chartType: string;
  connector: string;
  tag: string;
}

export interface TemplateFilter {
  id: "search" | "chartType" | "connector" | "tag";
  label: string;
  operator?: string;
  value: string;
}

/** The filter line's chips, one per active filter; "all" is no filter. */
export function templateFilters(
  state: TemplateFilterState,
  names: { chartType: string; connector: string },
): TemplateFilter[] {
  const filters: TemplateFilter[] = [];
  const term = state.search.trim();
  if (term) {
    filters.push({
      id: "search",
      label: "Name",
      operator: "contains",
      value: term,
    });
  }
  if (state.chartType !== "all") {
    filters.push({ id: "chartType", label: "Chart", value: names.chartType });
  }
  if (state.connector !== "all") {
    filters.push({
      id: "connector",
      label: "Connector",
      value: names.connector,
    });
  }
  if (state.tag !== "all") {
    filters.push({ id: "tag", label: "Tag", value: state.tag });
  }
  return filters;
}
