"use client";

import {
  Alert,
  AlertDescription,
  Button,
  Skeleton,
} from "@neoboard/components";
import type { ConnectorDescriptor } from "@neoboard/connection";
import { ConnectorIcon } from "./connector-icon";

/**
 * What a connector's `category` reads as. The ONE place the app words a
 * category — keyed by category, never by connector, so connector N+1 gets its
 * sub-label with no edit here.
 */
const CATEGORY_LABELS: Record<ConnectorDescriptor["category"], string> = {
  database: "Database",
  graph: "Graph database",
  api: "API",
  file: "File",
};

const GRID = "grid grid-cols-2 gap-4 py-4";

interface ConnectorTypePickerProps {
  /** From `useConnectors()`; `undefined` until it has loaded. */
  readonly connectors:
    | Pick<ConnectorDescriptor, "type" | "label" | "category" | "iconSvg">[]
    | undefined;
  readonly isLoading: boolean;
  readonly isError: boolean;
  readonly onRetry: () => void;
  readonly onPick: (type: string) => void;
}

/**
 * First step of "Add Connection" (#1899): one button per installed connector,
 * rendered from the descriptors `GET /api/connectors` serves. Nothing here
 * knows which connectors exist — so when that request fails there is nothing
 * to fall back to, and the user gets a retry rather than a guess.
 */
export function ConnectorTypePicker({
  connectors,
  isLoading,
  isError,
  onRetry,
  onPick,
}: ConnectorTypePickerProps) {
  if (isLoading) {
    return (
      <div className={GRID}>
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    );
  }
  if (isError || !connectors) {
    return (
      <Alert variant="destructive" className="my-4">
        <AlertDescription className="flex items-center justify-between gap-3">
          Could not load the available connectors.
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (connectors.length === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No connectors are installed on this server.
      </p>
    );
  }
  return (
    <div className={GRID}>
      {connectors.map((connector) => (
        <button
          key={connector.type}
          type="button"
          data-testid={"pick-" + connector.type}
          onClick={() => onPick(connector.type)}
          className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-border p-6 text-center transition-colors hover:border-primary hover:bg-accent"
        >
          <ConnectorIcon
            connector={connector}
            className="h-10 w-10 text-muted-foreground"
          />
          <div>
            <p className="font-semibold">{connector.label}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {CATEGORY_LABELS[connector.category]}
            </p>
          </div>
        </button>
      ))}
    </div>
  );
}
