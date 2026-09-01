import { cn } from "@/lib/utils";
import { connectionStatusColors } from "@/lib/design-tokens";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ConnectionState =
  | "connected"
  | "disconnected"
  | "connecting"
  | "error"
  /**
   * Not checked yet. Distinct from "disconnected", which is a verdict.
   * Without this the connections page had to render "we have not looked" as
   * "this connection is down", so every visit asserted every connection was
   * broken for a frame before probing (#1544).
   */
  | "unknown";

export interface ConnectionStatusProps {
  status: ConnectionState;
  /** When provided, the badge shows a tooltip with this error message on hover. */
  errorMessage?: string;
  className?: string;
}

const statusConfig: Record<
  ConnectionState,
  {
    label: string;
    dotClass: string;
    variant:
      | "default"
      | "secondary"
      | "destructive"
      | "outline"
      | "success"
      | "warning";
  }
> = {
  unknown: {
    label: "Not checked",
    dotClass: connectionStatusColors.unknown,
    // Deliberately the quietest variant available, and no pulse: this state
    // is the absence of information, so it must not compete for attention
    // with the states that carry a real signal.
    variant: "outline",
  },
  connected: {
    label: "Connected",
    dotClass: connectionStatusColors.connected,
    variant: "success",
  },
  disconnected: {
    label: "Disconnected",
    dotClass: connectionStatusColors.disconnected,
    variant: "secondary",
  },
  connecting: {
    label: "Connecting...",
    dotClass: connectionStatusColors.connecting,
    variant: "warning",
  },
  error: {
    label: "Error",
    dotClass: connectionStatusColors.error,
    variant: "destructive",
  },
};

function ConnectionStatus({
  status,
  errorMessage,
  className,
}: ConnectionStatusProps) {
  const config = statusConfig[status];
  const badge = (
    <Badge
      variant={config.variant}
      className={cn("gap-1.5", className)}
      // Announce connection-state changes to assistive tech (#1059).
      role="status"
      // #1283: the error text used to live only in the hover tooltip, and
      // Badge is a non-focusable <div>, so keyboard/AT users could never
      // reach it. Fold it into the accessible name instead of adding focus
      // management — the tooltip stays purely visual.
      aria-label={
        errorMessage
          ? `Connection status: ${config.label}. ${errorMessage}`
          : `Connection status: ${config.label}`
      }
    >
      <span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
      {config.label}
    </Badge>
  );

  if (!errorMessage) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent
          side="bottom"
          className="max-w-xs break-words"
          data-testid="connection-error-tooltip"
        >
          {errorMessage}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { ConnectionStatus };
