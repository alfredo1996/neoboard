"use client";

import { useParams, usePathname } from "next/navigation";
import { DashboardWorkspace } from "@/components/dashboard-workspace";
import { useConnectorRecovery } from "@/hooks/use-connector-recovery";

/**
 * The dashboard UI lives here rather than in either page, so that navigating
 * between /[id] and /[id]/edit re-renders only the (empty) page slot and leaves
 * the widget tree mounted (#1370). Both URLs keep working unchanged.
 *
 * `key={id}` scopes the workspace to one dashboard: /A → /B stays inside this
 * layout, and without the key the module-level dashboard store would carry A's
 * page index over to B.
 */
export default function DashboardIdLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const editMode = pathname.endsWith("/edit");
  // Once per dashboard, not per card: one probe per dead connection (#2167).
  useConnectorRecovery();

  return (
    <DashboardWorkspace key={id} id={id} editMode={editMode}>
      {children}
    </DashboardWorkspace>
  );
}
