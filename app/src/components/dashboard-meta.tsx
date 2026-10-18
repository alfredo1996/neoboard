import { TimeAgo } from "@neoboard/components";
import { pluralWidgets } from "@/lib/widget/plural-widgets";

/** The header's meta line: "Updated 3 min ago by Alice · 12 widgets · Public". */
export function DashboardMeta({
  updatedAt,
  updatedByName,
  widgetCount,
  isPublic,
}: Readonly<{
  updatedAt: string | Date;
  updatedByName?: string | null;
  widgetCount: number;
  isPublic: boolean;
}>) {
  return (
    <span>
      Updated{" "}
      <TimeAgo
        date={updatedAt}
        showTooltip={false}
        className="text-[length:inherit]"
      />
      {updatedByName ? <> by {updatedByName}</> : null} ·{" "}
      {pluralWidgets(widgetCount)}
      {isPublic ? " · Public" : null}
    </span>
  );
}
