import type {
  DashboardLayout,
  DashboardLayoutV1,
  DashboardLayoutV2,
} from "@/lib/db/schema";

function isV2(raw: unknown): raw is DashboardLayoutV2 {
  return (
    typeof raw === "object" &&
    raw !== null &&
    (raw as DashboardLayoutV2).version === 2 &&
    Array.isArray((raw as DashboardLayoutV2).pages)
  );
}

/**
 * Normalise any stored layout (v1 or v2) to the current v2 format.
 * V1 layouts are wrapped in a single default page.
 */
export function migrateLayout(
  raw: DashboardLayout | null | undefined
): DashboardLayoutV2 {
  if (!raw) {
    return {
      version: 2,
      pages: [{ id: "page-1", title: "Page 1", widgets: [], gridLayout: [] }],
    };
  }

  if (isV2(raw)) return raw;

  // Legacy v1: { widgets, gridLayout }
  const v1 = raw as DashboardLayoutV1;
  return {
    version: 2,
    pages: [
      {
        id: "page-1",
        title: "Page 1",
        widgets: v1.widgets ?? [],
        gridLayout: v1.gridLayout ?? [],
      },
    ],
  };
}
