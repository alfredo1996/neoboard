import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TimeAgoProps {
  date: Date | string | number;
  className?: string;
  showTooltip?: boolean;
}

function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (weeks < 4) return `${weeks}w ago`;
  if (months < 12) return `${months}mo ago`;
  return `${years}y ago`;
}

function formatFullDate(date: Date): string {
  return date.toLocaleString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TimeAgo({ date, className, showTooltip = true }: TimeAgoProps) {
  const dateObj = React.useMemo(() => {
    if (date instanceof Date) return date;
    return new Date(date);
  }, [date]);

  const [timeAgo, setTimeAgo] = React.useState(() => formatTimeAgo(dateObj));

  React.useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatTimeAgo(dateObj));
    }, 60000); // Update every minute

    return () => clearInterval(interval);
  }, [dateObj]);

  const content = (
    <time dateTime={dateObj.toISOString()} className={cn("text-sm", className)}>
      {timeAgo}
    </time>
  );

  if (!showTooltip) {
    return content;
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{content}</TooltipTrigger>
        <TooltipContent>
          <p>{formatFullDate(dateObj)}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { TimeAgo };
