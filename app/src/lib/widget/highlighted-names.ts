/**
 * Which marks of a chart the widget's own click action has selected (#2226).
 *
 * The click action is saved at `widget.settings.clickAction`; each
 * set-parameter mapping (the action itself, or each of its `rules[]`) names a
 * parameter and the source column its value came from. A row is selected when
 * its source column holds the parameter's current value, so an id column works
 * as well as the label. Returns the selected rows' names (bar `label`, pie
 * `name`), or undefined when nothing is selected. Only the widget's own action
 * is read: a filter set elsewhere is not a selection here.
 */

interface Mapping {
  parameterName?: string;
  sourceField?: string;
}

interface Action {
  type?: string;
  parameterMapping?: Mapping;
  rules?: Action[];
}

const SETS_PARAMETER = new Set(["set-parameter", "set-parameter-and-navigate"]);

function mappingsOf(action: Action | undefined): Mapping[] {
  if (!action) return [];
  const own = SETS_PARAMETER.has(action.type ?? "") ? [action] : [];
  const all = [
    ...own,
    ...(action.rules ?? []).filter((r) => SETS_PARAMETER.has(r.type ?? "")),
  ];
  return all.flatMap((a) => (a.parameterMapping ? [a.parameterMapping] : []));
}

/** The raw query column of a transformed row (#1589), else the row's own key. */
function columnOf(row: Record<string, unknown>, column: string): unknown {
  const props = row.properties;
  if (props && typeof props === "object" && column in props) {
    return (props as Record<string, unknown>)[column];
  }
  return row[column];
}

function valuesOf(v: unknown): Set<string> {
  const list = Array.isArray(v) ? v : [v];
  return new Set(
    list.filter((x) => x !== undefined && x !== null && x !== "").map(String),
  );
}

/** A cell a parameter value can equal; an object or array never matches. */
function isScalar(v: unknown): v is string | number | boolean | bigint {
  const t = typeof v;
  return t === "string" || t === "number" || t === "boolean" || t === "bigint";
}

export function highlightedNames(
  data: unknown,
  settings: Record<string, unknown>,
  paramValues: Record<string, unknown> | undefined,
): unknown[] | undefined {
  if (!Array.isArray(data)) return undefined;
  const wanted = mappingsOf(settings.clickAction as Action | undefined).flatMap(
    ({ parameterName, sourceField }) => {
      const values = parameterName
        ? valuesOf(paramValues?.[parameterName])
        : new Set<string>();
      return sourceField && values.size ? [{ sourceField, values }] : [];
    },
  );
  if (!wanted.length) return undefined;
  const names = (data as Record<string, unknown>[])
    .filter(
      (row) =>
        row !== null &&
        typeof row === "object" &&
        wanted.some(({ sourceField, values }) => {
          const cell = columnOf(row, sourceField);
          return isScalar(cell) && values.has(String(cell));
        }),
    )
    .map((row) => row.label ?? row.name);
  return names.length ? names : undefined;
}
