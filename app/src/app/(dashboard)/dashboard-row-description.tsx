import type { ReactNode } from "react";
import { Tag } from "@neoboard/components";

const MAX_CHIPS = 3;

/**
 * A list row's description line (#1692): up to three tag chips, then "+N" with
 * every tag in its title, then the description. A flex line 3px under the
 * name, so the kit's `ListRow` is unchanged: chips sit 4px apart, the
 * description starts 8px after the last chip (gap-1 plus ml-1), and it keeps
 * its own ellipsis.
 */
export function dashboardRowDescription(
  tags: readonly string[],
  description: string | null,
): ReactNode {
  if (tags.length === 0) return description ?? undefined;
  const more = tags.length - MAX_CHIPS;
  return (
    <span className="mt-[3px] flex items-center gap-1">
      {tags.slice(0, MAX_CHIPS).map((t) => (
        <Tag key={t} className="shrink-0">
          {t}
        </Tag>
      ))}
      {more > 0 && (
        <span className="shrink-0 text-xs" title={tags.join(", ")}>
          {`+${more}`}
        </span>
      )}
      {description && (
        <span className="ml-1 min-w-0 truncate">{description}</span>
      )}
    </span>
  );
}
