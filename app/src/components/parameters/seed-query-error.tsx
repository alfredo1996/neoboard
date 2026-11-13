"use client";

import { WidgetErrorState } from "@/components/widget-error-state";
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
 * Retry is the immediate way back: the seed query has no interval and no
 * auto-retry. The dashboard also re-probes a dead connection by itself every
 * `DEAD_CONNECTOR_TTL_MS` and re-runs this seed once it answers (#2167).
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
  // The very state a chart card shows on a dead connector (#1888, #2335):
  // one component, so the two cannot drift apart again.
  return (
    <WidgetErrorState
      heading={unavailable ? "Connector unavailable" : "Couldn't load options"}
      hint={message}
      onRetry={onRetry}
    />
  );
}
