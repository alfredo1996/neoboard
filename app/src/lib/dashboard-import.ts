import { z } from "zod";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

const widgetSchema = z
  .object({
    id: z.string(),
    chartType: z.string(),
    connectionId: z.string(),
    query: z.string(),
  })
  .passthrough();

const gridLayoutItemSchema = z
  .object({
    i: z.string(),
    x: z.number(),
    y: z.number(),
    w: z.number(),
    h: z.number(),
  })
  .passthrough();

const pageSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    widgets: z.array(widgetSchema),
    gridLayout: z.array(gridLayoutItemSchema),
  })
  .passthrough();

export const neoboardExportSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: z.string(),
  dashboard: z.object({
    name: z.string().min(1),
    description: z.string().nullable().optional(),
  }),
  connections: z.record(
    z.object({
      name: z.string(),
      type: z.string(),
    })
  ),
  layout: z.object({
    version: z.literal(2),
    pages: z.array(pageSchema),
  }),
});

export type NeoboardExportInput = z.infer<typeof neoboardExportSchema>;

export function applyConnectionMapping(
  layout: DashboardLayoutV2,
  mapping: Record<string, string>
): DashboardLayoutV2 {
  return {
    ...layout,
    pages: layout.pages.map((page) => ({
      ...page,
      widgets: page.widgets.map((widget) => ({
        ...widget,
        connectionId:
          widget.connectionId && mapping[widget.connectionId] !== undefined
            ? mapping[widget.connectionId]
            : widget.connectionId,
      })),
      gridLayout: page.gridLayout.map((item) => ({ ...item })),
    })),
  };
}
