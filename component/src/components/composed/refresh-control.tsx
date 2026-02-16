import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface RefreshInterval {
  label: string;
  value: string;
  seconds: number;
}

export interface RefreshControlProps {
  enabled?: boolean;
  onToggle?: (enabled: boolean) => void;
  interval?: string;
  onIntervalChange?: (value: string) => void;
  intervals?: RefreshInterval[];
  onRefreshNow?: () => void;
  refreshing?: boolean;
  className?: string;
}

const defaultIntervals: RefreshInterval[] = [
  { label: "5s", value: "5", seconds: 5 },
  { label: "10s", value: "10", seconds: 10 },
  { label: "30s", value: "30", seconds: 30 },
  { label: "1m", value: "60", seconds: 60 },
  { label: "5m", value: "300", seconds: 300 },
];

function RefreshControl({
  enabled = false,
  onToggle,
  interval,
  onIntervalChange,
  intervals = defaultIntervals,
  onRefreshNow,
  refreshing = false,
  className,
}: RefreshControlProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      {onRefreshNow && (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="h-8 w-8"
          onClick={onRefreshNow}
          disabled={refreshing}
        >
          <RefreshCw
            className={cn("h-4 w-4", refreshing && "animate-spin")}
          />
          <span className="sr-only">Refresh now</span>
        </Button>
      )}
      <Button
        type="button"
        variant={enabled ? "default" : "outline"}
        size="sm"
        onClick={() => onToggle?.(!enabled)}
      >
        {enabled ? "Auto" : "Off"}
      </Button>
      {enabled && (
        <Select value={interval} onValueChange={onIntervalChange}>
          <SelectTrigger className="w-[80px] h-8">
            <SelectValue placeholder="Interval" />
          </SelectTrigger>
          <SelectContent>
            {intervals.map((i) => (
              <SelectItem key={i.value} value={i.value}>
                {i.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}

export { RefreshControl };
