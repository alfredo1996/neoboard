import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, Plus } from "lucide-react";
import type { ColorScaleConfig } from "@/charts/styling-rule";

export interface ColorScalePanelProps {
  columns: string[];
  colorScales: ColorScaleConfig[];
  onColorScalesChange: (scales: ColorScaleConfig[]) => void;
}

/** @deprecated Use ColorScalePanelProps instead */
export type ConditionalFormatPanelProps = ColorScalePanelProps;

function ColorScaleRow({
  scale,
  columns,
  onChange,
  onRemove,
}: {
  scale: ColorScaleConfig;
  columns: string[];
  onChange: (updated: ColorScaleConfig) => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-end gap-2 rounded-lg border p-3">
      <div className="space-y-1">
        <Label className="text-xs">Column</Label>
        <Select value={scale.column} onValueChange={(v) => onChange({ ...scale, column: v })}>
          <SelectTrigger className="w-[120px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {columns.map((col) => (
              <SelectItem key={col} value={col}>{col}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Min Color</Label>
        <Input
          type="color"
          className="w-[48px] h-9 p-1 cursor-pointer"
          value={scale.minColor}
          onChange={(e) => onChange({ ...scale, minColor: e.target.value })}
        />
      </div>

      <div
        className="h-9 flex-1 min-w-[60px] rounded-md border"
        style={{
          background: `linear-gradient(to right, ${scale.minColor}, ${scale.maxColor})`,
        }}
      />

      <div className="space-y-1">
        <Label className="text-xs">Max Color</Label>
        <Input
          type="color"
          className="w-[48px] h-9 p-1 cursor-pointer"
          value={scale.maxColor}
          onChange={(e) => onChange({ ...scale, maxColor: e.target.value })}
        />
      </div>

      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={onRemove} aria-label="Remove color scale">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

function ColorScalePanel({
  columns,
  colorScales,
  onColorScalesChange,
}: ColorScalePanelProps) {
  function addColorScale() {
    const newScale: ColorScaleConfig = {
      column: columns[0] ?? "",
      minColor: "#ef4444",
      maxColor: "#22c55e",
    };
    onColorScalesChange([...colorScales, newScale]);
  }

  function updateColorScale(index: number, updated: ColorScaleConfig) {
    const next = [...colorScales];
    next[index] = updated;
    onColorScalesChange(next);
  }

  function removeColorScale(index: number) {
    onColorScalesChange(colorScales.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      {colorScales.map((scale, i) => (
        <ColorScaleRow
          key={`${scale.column}-${i}`}
          scale={scale}
          columns={columns}
          onChange={(updated) => updateColorScale(i, updated)}
          onRemove={() => removeColorScale(i)}
        />
      ))}
      <Button variant="outline" size="sm" className="gap-1" onClick={addColorScale}>
        <Plus className="h-3 w-3" />
        Add Color Scale
      </Button>
    </div>
  );
}

/** @deprecated Use ColorScalePanel instead */
const ConditionalFormatPanel = ColorScalePanel;

export { ColorScalePanel, ConditionalFormatPanel };
