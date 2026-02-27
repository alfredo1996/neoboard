"use client";

import {
  Label,
  TextInputParameter,
  DatePickerParameter,
  DateRangeParameter,
  DateRelativePicker,
  ParamSelector,
  ParamMultiSelector,
} from "@neoboard/components";
import type { ParamUIType, DateSubType } from "./parameter-config-section";

export interface ParameterPreviewProps {
  paramUIType: ParamUIType;
  dateSub: DateSubType;
  multiSelect: boolean;
  paramWidgetName: string;
  chartOptions: Record<string, unknown>;
  seedPreviewOptions: { value: string; label: string }[] | null;
  seedQueryPending: boolean;
}

export function ParameterPreview({
  paramUIType,
  dateSub,
  multiSelect,
  paramWidgetName,
  chartOptions,
  seedPreviewOptions,
  seedQueryPending,
}: ParameterPreviewProps) {
  return (
    <div className="h-full flex items-center justify-center p-6" data-testid="param-preview">
      <div className="w-full max-w-xs space-y-3">
        <Label className="text-xs text-muted-foreground block">
          {paramWidgetName ? `$param_${paramWidgetName}` : "Parameter preview"}
        </Label>
        {paramUIType === "freetext" && (
          <TextInputParameter
            parameterName={paramWidgetName || "preview"}
            value=""
            onChange={() => {}}
            placeholder={
              (chartOptions.placeholder as string) || "Type a value..."
            }
          />
        )}
        {paramUIType === "date" && dateSub === "single" && (
          <DatePickerParameter
            parameterName={paramWidgetName || "preview"}
            value=""
            onChange={() => {}}
          />
        )}
        {paramUIType === "date" && dateSub === "range" && (
          <DateRangeParameter
            parameterName={paramWidgetName || "preview"}
            from=""
            to=""
            onChange={() => {}}
          />
        )}
        {paramUIType === "date" && dateSub === "relative" && (
          <DateRelativePicker
            parameterName={paramWidgetName || "preview"}
            value=""
            onChange={() => {}}
          />
        )}
        {paramUIType === "select" && !multiSelect && (
          <ParamSelector
            parameterName={paramWidgetName || "preview"}
            value=""
            onChange={() => {}}
            options={seedPreviewOptions ?? [
              { value: "option-1", label: "Option 1" },
              { value: "option-2", label: "Option 2" },
              { value: "option-3", label: "Option 3" },
            ]}
            loading={seedQueryPending}
            placeholder={
              (chartOptions.placeholder as string) || "Select..."
            }
          />
        )}
        {paramUIType === "select" && multiSelect && (
          <ParamMultiSelector
            parameterName={paramWidgetName || "preview"}
            values={[]}
            onChange={() => {}}
            options={seedPreviewOptions ?? [
              { value: "option-1", label: "Option 1" },
              { value: "option-2", label: "Option 2" },
              { value: "option-3", label: "Option 3" },
            ]}
            loading={seedQueryPending}
            placeholder={
              (chartOptions.placeholder as string) || "Select..."
            }
          />
        )}
      </div>
    </div>
  );
}
