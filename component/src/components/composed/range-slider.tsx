import * as React from "react";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface RangeSliderMark {
  value: number;
  label: string;
}

export interface RangeSliderProps {
  min?: number;
  max?: number;
  step?: number;
  value?: [number, number];
  defaultValue?: [number, number];
  onValueChange?: (value: [number, number]) => void;
  marks?: RangeSliderMark[];
  showInput?: boolean;
  disabled?: boolean;
  className?: string;
}

function RangeSlider({
  min = 0,
  max = 100,
  step = 1,
  value,
  defaultValue,
  onValueChange,
  marks,
  showInput = false,
  disabled = false,
  className,
}: RangeSliderProps) {
  const [internalValue, setInternalValue] = React.useState<[number, number]>(
    value ?? defaultValue ?? [min, max]
  );

  const currentValue = value ?? internalValue;

  const handleSliderChange = (newValue: number[]) => {
    const rangeValue: [number, number] = [newValue[0], newValue[1]];
    if (!value) setInternalValue(rangeValue);
    onValueChange?.(rangeValue);
  };

  const handleInputChange = (index: 0 | 1, inputValue: string) => {
    const num = Number(inputValue);
    if (isNaN(num)) return;
    const clamped = Math.min(Math.max(num, min), max);
    const newValue: [number, number] = [...currentValue] as [number, number];
    newValue[index] = clamped;
    // Ensure min <= max
    if (index === 0 && newValue[0] > newValue[1]) newValue[0] = newValue[1];
    if (index === 1 && newValue[1] < newValue[0]) newValue[1] = newValue[0];
    if (!value) setInternalValue(newValue);
    onValueChange?.(newValue);
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-4">
        {showInput && (
          <Input
            type="number"
            value={currentValue[0]}
            onChange={(e) => handleInputChange(0, e.target.value)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="w-20 text-center"
            aria-label="Range minimum"
          />
        )}
        <Slider
          min={min}
          max={max}
          step={step}
          value={currentValue}
          onValueChange={handleSliderChange}
          disabled={disabled}
          className="flex-1"
        />
        {showInput && (
          <Input
            type="number"
            value={currentValue[1]}
            onChange={(e) => handleInputChange(1, e.target.value)}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            className="w-20 text-center"
            aria-label="Range maximum"
          />
        )}
      </div>
      {marks && marks.length > 0 && (
        <div className="relative w-full px-2">
          <div className="flex justify-between">
            {marks.map((mark) => (
              <div
                key={mark.value}
                className="flex flex-col items-center"
                style={{
                  position: "absolute",
                  left: `${((mark.value - min) / (max - min)) * 100}%`,
                  transform: "translateX(-50%)",
                }}
              >
                <div className="h-2 w-px bg-muted-foreground/50" />
                <span className="mt-1 text-xs text-muted-foreground">{mark.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { RangeSlider };
