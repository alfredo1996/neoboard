import * as React from "react";
import { cn } from "@/lib/utils";

export interface KeyValueItem {
  key: string;
  value: React.ReactNode;
}

export interface KeyValueListProps {
  items: KeyValueItem[];
  className?: string;
  orientation?: "horizontal" | "vertical";
}

function KeyValueList({
  items,
  className,
  orientation = "vertical",
}: KeyValueListProps) {
  if (orientation === "horizontal") {
    return (
      <div className={cn("flex flex-wrap gap-x-6 gap-y-2", className)}>
        {items.map((item, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">{item.key}:</span>
            <span className="text-sm font-medium">{item.value}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <dl className={cn("space-y-3", className)}>
      {items.map((item, index) => (
        <div key={index} className="flex justify-between gap-4">
          <dt className="text-sm text-muted-foreground">{item.key}</dt>
          <dd className="text-sm font-medium text-right">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export { KeyValueList };
