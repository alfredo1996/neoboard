import * as React from "react";
import { Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ColorPickerProps {
  value?: string;
  onValueChange?: (color: string) => void;
  presets?: string[];
  className?: string;
}

const defaultPresets = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e", "#64748b",
];

function ColorPicker({
  value = "#3b82f6",
  onValueChange,
  presets = defaultPresets,
  className,
}: ColorPickerProps) {
  const [hexInput, setHexInput] = React.useState(value);

  React.useEffect(() => {
    setHexInput(value);
  }, [value]);

  const handleHexSubmit = () => {
    if (/^#[0-9a-fA-F]{6}$/.test(hexInput)) {
      onValueChange?.(hexInput);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn("w-[120px] justify-start gap-2", className)}
        >
          <div
            className="h-4 w-4 rounded-sm border"
            style={{ backgroundColor: value }}
          />
          <span className="text-xs font-mono">{value}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[232px] p-3" align="start">
        <div className="grid grid-cols-8 gap-1.5">
          {presets.map((color) => (
            <button
              key={color}
              type="button"
              className={cn(
                "h-6 w-6 rounded-sm border transition-transform hover:scale-110",
                value === color && "ring-2 ring-primary ring-offset-2"
              )}
              style={{ backgroundColor: color }}
              onClick={() => onValueChange?.(color)}
            >
              {value === color && (
                <Check className="h-3 w-3 mx-auto text-white drop-shadow-[0_0_1px_rgba(0,0,0,0.5)]" />
              )}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Label htmlFor="hex-input" className="text-xs shrink-0">
            Hex
          </Label>
          <Input
            id="hex-input"
            value={hexInput}
            onChange={(e) => setHexInput(e.target.value)}
            onBlur={handleHexSubmit}
            onKeyDown={(e) => e.key === "Enter" && handleHexSubmit()}
            className="h-7 font-mono text-xs"
            maxLength={7}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { ColorPicker };
