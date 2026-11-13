"use client";

import { Unplug } from "lucide-react";
import { Button } from "@neoboard/components";

/**
 * The quiet "this widget could not load" state, drawn by every card that fails
 * on a dead connector or a failed seed query (#2335 DS-5). Two components used
 * to draw it with different alignment; one shared body keeps a selector card
 * and a chart card side by side reading the same.
 *
 * Not the boxed destructive Alert: that overflowed a KPI-sized card and cut
 * the hint mid-sentence, and a wall of red boxes read as twelve failures where
 * there is one — the connector (#1888). The hint is clamped, and squeezed out
 * entirely in the smallest cards, so `title` on the root keeps the whole
 * sentence reachable from anywhere in the card.
 */
export function WidgetErrorState({
  heading,
  hint,
  detail,
  onRetry,
}: Readonly<{
  heading: string;
  hint: string;
  /** The driver's own words — shown to editors, who can fix the connection. */
  detail?: string;
  onRetry?: () => void;
}>) {
  return (
    <div
      role="alert"
      title={hint}
      className="flex h-full min-h-0 flex-col items-center justify-center gap-1.5 overflow-hidden p-3 text-center"
    >
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Unplug className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
        {heading}
      </p>
      {/* First to give way: a KPI-sized card keeps the title and Retry. */}
      <p className="line-clamp-2 min-h-0 max-w-sm text-xs text-muted-foreground">
        {hint}
      </p>
      {detail && (
        <p
          title={detail}
          className="line-clamp-2 max-w-sm font-mono text-xs text-muted-foreground/70"
        >
          {detail}
        </p>
      )}
      {onRetry && (
        <Button
          variant="secondary"
          size="sm"
          className="mt-1 h-7 shrink-0 px-2.5 text-xs"
          onClick={onRetry}
        >
          Retry
        </Button>
      )}
    </div>
  );
}
