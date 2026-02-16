import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { ChartSettingsPanel } from '@/components/composed/chart-settings-panel';
import { ChartTypePicker } from '@/components/composed/chart-type-picker';
import { FieldPicker } from '@/components/composed/field-picker';
import { ColorPicker } from '@/components/composed/color-picker';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

const meta = {
  title: 'Composed/ChartSettingsPanel',
  component: ChartSettingsPanel,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof ChartSettingsPanel>;

export default meta;
type Story = StoryObj<typeof meta>;

const fields = [
  { name: "month", type: "string" as const },
  { name: "revenue", type: "number" as const },
  { name: "users", type: "number" as const },
  { name: "orders", type: "number" as const },
  { name: "createdAt", type: "date" as const },
];

export const Default: Story = {
  args: { dataTab: null, styleTab: null },
  render: () => {
    const [chartType, setChartType] = useState("bar");
    const [selectedFields, setSelectedFields] = useState(["month", "revenue"]);
    const [color, setColor] = useState("#3b82f6");

    return (
      <div className="w-[320px] border rounded-lg p-4">
        <ChartSettingsPanel
          dataTab={
            <div className="space-y-4">
              <div>
                <Label className="text-xs font-medium mb-2 block">Chart Type</Label>
                <ChartTypePicker value={chartType} onValueChange={setChartType} />
              </div>
              <div>
                <Label className="text-xs font-medium mb-2 block">Fields</Label>
                <FieldPicker
                  fields={fields}
                  selected={selectedFields}
                  onSelect={(f) => setSelectedFields([...selectedFields, f])}
                  onRemove={(f) => setSelectedFields(selectedFields.filter((s) => s !== f))}
                />
              </div>
            </div>
          }
          styleTab={
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Primary Color</Label>
                <ColorPicker value={color} onValueChange={setColor} />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="legend" className="text-xs">Show Legend</Label>
                <Switch id="legend" defaultChecked />
              </div>
              <div className="flex items-center justify-between">
                <Label htmlFor="grid" className="text-xs">Show Grid</Label>
                <Switch id="grid" defaultChecked />
              </div>
            </div>
          }
        />
      </div>
    );
  },
};
