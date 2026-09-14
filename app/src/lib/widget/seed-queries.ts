/**
 * The seed queries behind a widget's option lists (use-seed-query.ts), read
 * where use-widget-save.ts stores them: a parameter selector's under
 * chartOptions, a form's on each of its fields.
 *
 * The view-share query allowlist (dashboard-query-binding.ts) reads saved
 * layout JSON through this, so it accepts any shape and reads these two paths
 * only (#1814).
 */
export function seedQueriesOf(settings: unknown): string[] {
  const s = settings as
    | { chartOptions?: { seedQuery?: unknown } | null; formFields?: unknown }
    | null
    | undefined;
  const formFields = s?.formFields;
  const fields = Array.isArray(formFields)
    ? (formFields as Array<{ seedQuery?: unknown } | null>)
    : [];
  return [
    s?.chartOptions?.seedQuery,
    ...fields.map((f) => f?.seedQuery),
  ].filter((q): q is string => typeof q === "string");
}
