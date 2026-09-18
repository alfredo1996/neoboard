"use client";

import { Unplug } from "lucide-react";
import { Button } from "@neoboard/components";
import { ConnectorUnavailableError } from "@/lib/api/api-client";
import { hintForConnectionErrorCode } from "@/lib/connector/connection-error-classifier";

/**
 * What an option-backed parameter widget shows when its seed query failed.
 *
 * Rendered in place of the select, not inside it: an empty dropdown reads as
 * "no rows", and a dead connector is not that (#1678). A connector failure
 * gets the classifier's hint — the driver text is not useful to a viewer and
 * can carry the host; any other failure gets its message, since the seed
 * query is the author's and the message is how they fix it.
 *
 * Retry is the only way back: the seed query has no interval, no auto-retry,
 * and nothing else on the dashboard invalidates it, so without this the
 * select — and everything gated on it — would stay dead until a reload.
 */
export function SeedQueryError({
  error,
  onRetry,
}: Readonly<{
  error: Error;
  onRetry: () => void;
}>) {
  const unavailable = error instanceof ConnectorUnavailableError;
  const message = unavailable
    ? hintForConnectionErrorCode(error.reason)
    : error.message;
  // Same quiet look as a chart card on a dead connector (#1888): red body
  // text filled the selector card and pushed Retry out of it. The message is
  // clamped, so `title` keeps the whole of it reachable.
  return (
    <div className="space-y-1.5">
      <div role="alert" title={message} className="space-y-1">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Unplug className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          {unavailable ? "Connector unavailable" : "Couldn't load options"}
        </p>
        <p className="line-clamp-1 text-xs text-muted-foreground">{message}</p>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="h-7 px-2.5 text-xs"
        onClick={onRetry}
      >
        Retry
      </Button>
    </div>
  );
}
