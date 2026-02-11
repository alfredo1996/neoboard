import * as React from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface VerticalTabItem {
  value: string;
  label: string;
  content: React.ReactNode;
  icon?: React.ReactNode;
  disabled?: boolean;
}

export interface VerticalTabsProps {
  items: VerticalTabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  orientation?: "horizontal" | "vertical";
  className?: string;
}

function VerticalTabs({
  items,
  defaultValue,
  value,
  onValueChange,
  orientation = "vertical",
  className,
}: VerticalTabsProps) {
  const resolvedDefault = defaultValue ?? items[0]?.value;
  const isVertical = orientation === "vertical";

  return (
    <Tabs
      defaultValue={resolvedDefault}
      value={value}
      onValueChange={onValueChange}
      orientation={orientation}
      className={cn(
        isVertical && "flex gap-4",
        className
      )}
    >
      <TabsList
        className={cn(
          isVertical && "flex-col h-auto items-stretch bg-transparent gap-1 rounded-none border-r pr-4"
        )}
      >
        {items.map((item) => (
          <TabsTrigger
            key={item.value}
            value={item.value}
            disabled={item.disabled}
            className={cn(
              isVertical && "justify-start rounded-md data-[state=active]:bg-muted data-[state=active]:shadow-none"
            )}
          >
            {item.icon && <span className="mr-2">{item.icon}</span>}
            {item.label}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex-1">
        {items.map((item) => (
          <TabsContent key={item.value} value={item.value} className="mt-0">
            {item.content}
          </TabsContent>
        ))}
      </div>
    </Tabs>
  );
}

export { VerticalTabs };
