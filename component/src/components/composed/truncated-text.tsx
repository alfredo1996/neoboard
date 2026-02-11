import * as React from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface TruncatedTextProps {
  text: string;
  maxLength?: number;
  className?: string;
  showTooltip?: boolean;
}

function TruncatedText({
  text,
  maxLength,
  className,
  showTooltip = true,
}: TruncatedTextProps) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [isTruncated, setIsTruncated] = React.useState(false);

  React.useEffect(() => {
    const element = ref.current;
    if (element) {
      setIsTruncated(element.scrollWidth > element.clientWidth);
    }
  }, [text]);

  const displayText = maxLength && text.length > maxLength
    ? `${text.slice(0, maxLength)}...`
    : text;

  const shouldShowTooltip = showTooltip && (isTruncated || (maxLength && text.length > maxLength));

  if (!shouldShowTooltip) {
    return (
      <span ref={ref} className={cn("truncate block", className)}>
        {displayText}
      </span>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span ref={ref} className={cn("truncate block cursor-default", className)}>
            {displayText}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p className="max-w-xs break-words">{text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

export { TruncatedText };
