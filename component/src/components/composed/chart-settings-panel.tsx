import * as React from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

export interface ChartSettingsPanelProps {
  dataTab?: React.ReactNode;
  styleTab?: React.ReactNode;
  transformTab?: React.ReactNode;
  advancedTab?: React.ReactNode;
  defaultTab?: string;
  /** When this value changes, tabs reset to defaultTab (e.g. pass chartType). */
  resetKey?: string;
  className?: string;
}

function ChartSettingsPanel({
  dataTab,
  styleTab,
  transformTab,
  advancedTab,
  defaultTab = "data",
  resetKey,
  className,
}: ChartSettingsPanelProps) {
  const tabs = [
    { value: "data", label: "Data", content: dataTab },
    { value: "style", label: "Style", content: styleTab },
    ...(transformTab
      ? [{ value: "transform", label: "Transform", content: transformTab }]
      : []),
    ...(advancedTab
      ? [{ value: "advanced", label: "Advanced", content: advancedTab }]
      : []),
  ];

  return (
    <div className={cn("w-full", className)}>
      <Tabs key={resetKey} defaultValue={defaultTab}>
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
