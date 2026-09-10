"use client";

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
 */
export function SeedQueryError({ error }: { error: Error }) {
  const unavailable = error instanceof ConnectorUnavailableError;
  return (
    <p role="alert" className="text-xs text-destructive">
      <span className="font-medium">
        {unavailable ? "Connector unavailable" : "Couldn't load options"}
      </span>
      {" — "}
      {unavailable ? hintForConnectionErrorCode(error.reason) : error.message}
    </p>
  );
}
