import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface AvatarGroupItem {
  src?: string;
  name: string;
  fallback?: string;
}

export interface AvatarGroupProps {
  items: AvatarGroupItem[];
  max?: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "h-6 w-6 text-xs",
  md: "h-8 w-8 text-sm",
  lg: "h-10 w-10 text-base",
};

function AvatarGroup({ items, max = 4, size = "md", className }: AvatarGroupProps) {
  const visibleItems = items.slice(0, max);
  const overflowCount = items.length - max;

  const getInitials = (name: string) => {
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <TooltipProvider>
      <div className={cn("flex -space-x-2", className)}>
        {visibleItems.map((item, index) => (
          <Tooltip key={index}>
            <TooltipTrigger asChild>
              <Avatar
                className={cn(
                  sizeClasses[size],
                  "border-2 border-background ring-0"
                )}
              >
                {item.src && <AvatarImage src={item.src} alt={item.name} />}
                <AvatarFallback className="text-xs">
                  {item.fallback || getInitials(item.name)}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{item.name}</p>
            </TooltipContent>
          </Tooltip>
        ))}
        {overflowCount > 0 && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Avatar
                className={cn(
                  sizeClasses[size],
                  "border-2 border-background bg-muted"
                )}
              >
                <AvatarFallback className="text-xs">
                  +{overflowCount}
                </AvatarFallback>
              </Avatar>
            </TooltipTrigger>
            <TooltipContent>
              <p>{overflowCount} more</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </TooltipProvider>
  );
}

export { AvatarGroup };
