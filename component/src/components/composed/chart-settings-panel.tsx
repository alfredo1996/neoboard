import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface ChartSettingsPanelProps {
  dataTab?: React.ReactNode;
  styleTab?: React.ReactNode;
  advancedTab?: React.ReactNode;
  defaultTab?: string;
  className?: string;
}

function ChartSettingsPanel({
  dataTab,
  styleTab,
  advancedTab,
  defaultTab = "data",
  className,
}: ChartSettingsPanelProps) {
  const tabs = [
    { value: "data", label: "Data", content: dataTab },
    { value: "style", label: "Style", content: styleTab },
    ...(advancedTab
      ? [{ value: "advanced", label: "Advanced", content: advancedTab }]
      : []),
  ];

  return (
    <div className={cn("w-full", className)}>
      <Tabs defaultValue={defaultTab}>
        <TabsList className="w-full">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value} className="flex-1">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="mt-4">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

export { ChartSettingsPanel };
