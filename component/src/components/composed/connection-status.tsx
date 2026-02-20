import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export type ConnectionState = "connected" | "disconnected" | "connecting" | "error";

export interface ConnectionStatusProps {
  status: ConnectionState;
  /** When provided, the badge shows a tooltip with this error message on hover. */
  errorMessage?: string;
  className?: string;
}

const statusConfig: Record<ConnectionState, { label: string; dotClass: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  connected: { label: "Connected", dotClass: "bg-green-500", variant: "default" },
  disconnected: { label: "Disconnected", dotClass: "bg-gray-400", variant: "secondary" },
  connecting: { label: "Connecting...", dotClass: "bg-yellow-500 animate-pulse", variant: "outline" },
  error: { label: "Error", dotClass: "bg-red-500", variant: "destructive" },
};

function ConnectionStatus({ status, errorMessage, className }: ConnectionStatusProps) {
  const config = statusConfig[status];
  const badge = (
    <Badge variant={config.variant} className={cn("gap-1.5", className)}>
      <span className={cn("h-2 w-2 rounded-full", config.dotClass)} />
      {config.label}
    </Badge>
  );

  if (!errorMessage) return badge;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs break-words" data-testid="connection-error-tooltip">
          {errorMessage}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { ConnectionStatus };
