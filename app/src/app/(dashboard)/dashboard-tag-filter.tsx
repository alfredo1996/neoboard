import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tag,
} from "@neoboard/components";
import { dashboardTagOptions } from "@/lib/dashboard/dashboard-list-helpers";

type TagOption = ReturnType<typeof dashboardTagOptions>[number];

/**
 * The list's tag filter state (#1692). A tag whose last use an edit removed is
 * no longer picked: the stored value is cleared too, or the tag coming back
 * would narrow the list unasked.
 */
export function useTagFilter(
  dashboards: ReadonlyArray<{ tags?: readonly string[] }>,
) {
  const [pickedTag, setPickedTag] = useState("");
  const tagOptions = dashboardTagOptions(dashboards);
  const tagOption = tagOptions.find((o) => o.key === pickedTag);
  if (pickedTag && !tagOption) setPickedTag("");
  return {
    tagOptions,
    tagOption,
    activeTag: tagOption?.key ?? "",
    setPickedTag,
  };
}

export function DashboardTagPicker({
  options,
  selected,
  onPick,
}: Readonly<{
  options: readonly TagOption[];
  selected: TagOption | undefined;
  onPick: (key: string) => void;
}>) {
  return (
    <Select
      value={selected ? `tag:${selected.key}` : "all"}
      onValueChange={(v) => onPick(v === "all" ? "" : v.slice("tag:".length))}
    >
      <SelectTrigger className="w-[180px]" aria-label="Filter by tag">
        <SelectValue placeholder="All tags" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All tags</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.key} value={`tag:${o.key}`}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** The Edit details dialog's live "Saves as" line (#1692). */
export function SavedTagsPreview({ tags }: Readonly<{ tags: string[] }>) {
  if (tags.length === 0) return <span>No tags</span>;
  return (
    <>
      <span className="mr-1">Saves as</span>
      {tags.map((t) => (
        <Tag key={t}>{t}</Tag>
      ))}
    </>
  );
}
