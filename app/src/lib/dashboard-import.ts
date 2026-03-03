import { z } from "zod";
import type { DashboardLayoutV2 } from "@/lib/db/schema";

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
    pages: z.array(z.unknown()),
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
