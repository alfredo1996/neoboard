import { z } from "zod";
import type { DashboardWidget } from "@/lib/db/schema";

/**
 * A saved widget's query, named instead of sent (#2477): a proxy that caps
 * request bodies at a few KB (AWS WAF: 8 KB) refuses a long query's text. The
 * server loads the text from the saved dashboard. No `seed` means the widget's
 * main query; `seed: {}` a parameter selector's seed; `seed: { fieldId }` one
 * form field's seed.
 */
export const savedQueryRefSchema = z.object({
  dashboardId: z.string().min(1),
  widgetId: z.string().min(1),
  seed: z.object({ fieldId: z.string().min(1).optional() }).optional(),
});

export type SavedQueryRef = z.infer<typeof savedQueryRefSchema>;

type SeedHolder = { id?: unknown; seedQuery?: unknown };

function nonEmpty(q: unknown): string | undefined {
  return typeof q === "string" && q ? q : undefined;
}

/**
 * The query text a reference names on a saved widget, or undefined: a form's
 * own (write) query is never named, nor is a content-only widget's absent one.
 */
export function savedQueryText(
  widget: Pick<DashboardWidget, "chartType" | "query" | "settings">,
  seed: SavedQueryRef["seed"],
): string | undefined {
  if (!seed) {
    return widget.chartType === "form" ? undefined : nonEmpty(widget.query);
  }
  const settings = widget.settings as {
    chartOptions?: SeedHolder | null;
    formFields?: unknown;
  } | null;
  if (seed.fieldId === undefined) {
    return nonEmpty(settings?.chartOptions?.seedQuery);
  }
  const fields = Array.isArray(settings?.formFields)
    ? (settings.formFields as Array<SeedHolder | null>)
    : [];
  return nonEmpty(fields.find((f) => f?.id === seed.fieldId)?.seedQuery);
}
