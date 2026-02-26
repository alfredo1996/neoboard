import type { Meta, StoryObj } from "@storybook/react";
import { useState, useMemo } from "react";
import {
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Hash,
  GitGraph,
  Map,
  Table2,
  Braces,
  SlidersHorizontal,
  Calendar,
  Type,
  ListFilter,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { RelativeDatePreset } from "@/components/composed/parameter-widgets/date-relative-picker";
import { ChartSettingsPanel } from "@/components/composed/chart-settings-panel";
import { ChartOptionsPanel } from "@/components/composed/chart-options-panel";
import { BarChart } from "@/charts/bar-chart";
import { TextInputParameter } from "@/components/composed/parameter-widgets/text-input";
import { DatePickerParameter } from "@/components/composed/parameter-widgets/date-picker";
import { DateRangeParameter } from "@/components/composed/parameter-widgets/date-range-picker";
import { DateRelativePicker } from "@/components/composed/parameter-widgets/date-relative-picker";
import { ParamSelector } from "@/components/composed/parameter-widgets/param-selector";
import { ParamMultiSelector } from "@/components/composed/parameter-widgets/param-multi-selector";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ── Chart type icon map (mirrors widget-editor-modal.tsx) ───────────

const chartTypeMeta: Record<string, { label: string; Icon: LucideIcon }> = {
  bar: { label: "Bar Chart", Icon: BarChart3 },
  line: { label: "Line Chart", Icon: LineChartIcon },
  pie: { label: "Pie Chart", Icon: PieChartIcon },
  "single-value": { label: "Single Value", Icon: Hash },
  graph: { label: "Graph", Icon: GitGraph },
  map: { label: "Map", Icon: Map },
  table: { label: "Data Table", Icon: Table2 },
  json: { label: "JSON Viewer", Icon: Braces },
  "parameter-select": { label: "Parameter Selector", Icon: SlidersHorizontal },
};

const chartTypes = Object.keys(chartTypeMeta);

// ── Parameter type helpers ──────────────────────────────────────────

type ParamUIType = "date" | "freetext" | "select";
type DateSubType = "single" | "range" | "relative";

const paramTypeMeta: Record<ParamUIType, { label: string; Icon: LucideIcon }> = {
  date: { label: "Date Picker", Icon: Calendar },
  freetext: { label: "Freetext", Icon: Type },
  select: { label: "Select", Icon: ListFilter },
};

const paramTypes = Object.keys(paramTypeMeta) as ParamUIType[];

function resolveInternalParamType(
  ui: ParamUIType,
  dateSub: DateSubType,
  multi: boolean
): string {
  if (ui === "date")
    return dateSub === "range"
      ? "date-range"
      : dateSub === "relative"
        ? "date-relative"
        : "date";
  if (ui === "freetext") return "text";
  return multi ? "multi-select" : "select";
}

const SAMPLE_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "FR", label: "France" },
  { value: "JP", label: "Japan" },
];

const SAMPLE_BAR_DATA = [
  { label: "Jan", revenue: 4200, expenses: 2400 },
  { label: "Feb", revenue: 3800, expenses: 2100 },
  { label: "Mar", revenue: 5100, expenses: 2800 },
  { label: "Apr", revenue: 4600, expenses: 2600 },
  { label: "May", revenue: 5400, expenses: 3100 },
  { label: "Jun", revenue: 6200, expenses: 3400 },
];

// ── Storybook meta ──────────────────────────────────────────────────

/**
 * Prototype for the Widget Editor modal.
 *
 * Two-column layout matching the real modal:
 * - **Left**: Connection, chart type dropdown, Data/Style/Advanced tabs
 * - **Right**: Live preview panel (chart or parameter widget)
 *
 * Use this to iterate on the editor UX before integrating into the app.
 */
const meta = {
  title: "Composed/WidgetEditorPrototype",
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// ── Main story: full widget editor ──────────────────────────────────

export const Default: Story = {
  render: () => {
    const [chartType, setChartType] = useState("bar");
    const [title, setTitle] = useState("");
    const [query, setQuery] = useState(
      "SELECT month, revenue, expenses FROM financials"
    );
    const [chartOptions, setChartOptions] = useState<
      Record<string, unknown>
    >({});

    // Parameter state (only used when chartType === "parameter-select")
    const [paramUIType, setParamUIType] = useState<ParamUIType>("select");
    const [dateSub, setDateSub] = useState<DateSubType>("single");
    const [multiSelect, setMultiSelect] = useState(false);
    const [paramName, setParamName] = useState("");
    const [seedQuery, setSeedQuery] = useState("");

    // Advanced tab state
    const [enableCache, setEnableCache] = useState(false);
    const [cacheTtlMinutes, setCacheTtlMinutes] = useState(5);
    const [clickActionEnabled, setClickActionEnabled] = useState(false);
    const [clickParamName, setClickParamName] = useState("");
    const [sourceField, setSourceField] = useState("");

    // Preview state (for parameter widgets)
    const [previewTextValue, setPreviewTextValue] = useState("");
    const [previewDateValue, setPreviewDateValue] = useState("");
    const [previewDateFrom, setPreviewDateFrom] = useState("");
    const [previewDateTo, setPreviewDateTo] = useState("");
    const [previewRelValue, setPreviewRelValue] = useState<
      RelativeDatePreset | ""
    >("");
    const [previewSelectValue, setPreviewSelectValue] = useState("");
    const [previewMultiValues, setPreviewMultiValues] = useState<string[]>(
      []
    );

    const isParamSelect = chartType === "parameter-select";

    const resolvedType = useMemo(
      () => resolveInternalParamType(paramUIType, dateSub, multiSelect),
      [paramUIType, dateSub, multiSelect]
    );

    const canSave = isParamSelect
      ? paramName.trim().length > 0 &&
        (paramUIType !== "select" || seedQuery.trim().length > 0)
      : query.trim().length > 0;

    // ── DATA TAB ────────────────────────────────────────────────

    const dataTab = isParamSelect ? (
      <div className="space-y-4">
        {/* Parameter Type dropdown */}
        <div className="space-y-1.5">
          <Label>Parameter Type</Label>
          <Select
            value={paramUIType}
            onValueChange={(v) => setParamUIType(v as ParamUIType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select parameter type..." />
            </SelectTrigger>
            <SelectContent>
              {paramTypes.map((type) => {
                const m = paramTypeMeta[type];
                const Icon = m.Icon;
                return (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {/* Date mode */}
        {paramUIType === "date" && (
          <div className="space-y-1.5">
            <Label>Date Mode</Label>
            <Select
              value={dateSub}
              onValueChange={(v) => setDateSub(v as DateSubType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Date</SelectItem>
                <SelectItem value="range">Date Range</SelectItem>
                <SelectItem value="relative">Relative Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Multi-select toggle */}
        {paramUIType === "select" && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="multi-toggle"
              checked={multiSelect}
              onCheckedChange={(c) => setMultiSelect(!!c)}
            />
            <Label htmlFor="multi-toggle" className="text-sm">
              Allow multiple selections
            </Label>
          </div>
        )}

        {/* Connection (select only) */}
        {paramUIType === "select" && (
          <div className="space-y-1.5">
            <Label>
              Connection <span className="text-destructive">*</span>
            </Label>
            <Select defaultValue="pg-demo">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pg-demo">PostgreSQL (demo)</SelectItem>
                <SelectItem value="neo4j-demo">Neo4j (movies)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Seed query (select only) */}
        {paramUIType === "select" && (
          <div className="space-y-1.5">
            <Label htmlFor="seed-query">
              Seed Query <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              First column = value, second column = label
            </p>
            <Textarea
              id="seed-query"
              value={seedQuery}
              onChange={(e) => setSeedQuery(e.target.value)}
              placeholder="SELECT DISTINCT value FROM table ORDER BY value"
              className="font-mono min-h-[80px]"
              rows={3}
            />
            <Button type="button" variant="outline" size="sm">
              Test Seed Query
            </Button>
          </div>
        )}

        {/* Parameter Name */}
        <div className="space-y-1.5">
          <Label htmlFor="param-name">
            Parameter Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="param-name"
            value={paramName}
            onChange={(e) => setParamName(e.target.value)}
            placeholder="e.g. country"
          />
          <p className="text-xs text-muted-foreground">
            Used to reference this parameter in widget queries
          </p>
        </div>

        {/* Reference hint */}
        {paramName && (
          <div className="border-t pt-4 space-y-1.5 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">
              Reference in queries
            </p>
            <p>
              Use:{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                $param_{paramName}
              </code>
            </p>
            {paramUIType === "date" &&
              (dateSub === "range" || dateSub === "relative") && (
                <p>
                  Sub-parameters:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    $param_{paramName}_from
                  </code>
                  ,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    $param_{paramName}_to
                  </code>
                </p>
              )}
          </div>
        )}
      </div>
    ) : (
      <div className="space-y-4">
        {/* Query */}
        <div className="space-y-1.5">
          <Label htmlFor="query">Query</Label>
          <Textarea
            id="query"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="SELECT * FROM users LIMIT 10"
            className="font-mono min-h-[100px]"
            rows={4}
          />
          <Button type="button" size="sm" disabled={!query.trim()}>
            Run Query
          </Button>
        </div>
      </div>
    );

    // ── STYLE TAB ───────────────────────────────────────────────

    const styleTab = (
      <ChartOptionsPanel
        chartType={chartType}
        settings={chartOptions}
        onSettingsChange={setChartOptions}
      />
    );

    // ── ADVANCED TAB ────────────────────────────────────────────

    const advancedTab = (
      <div className="space-y-4">
        {!isParamSelect && (
          <>
            <div className="space-y-4">
              <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                Caching
              </h4>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="enable-cache"
                  checked={enableCache}
                  onCheckedChange={(c) => setEnableCache(!!c)}
                />
                <Label htmlFor="enable-cache" className="text-sm">
                  Cache query results
                </Label>
              </div>
              {enableCache && (
                <div className="pl-6 space-y-1.5">
                  <Label htmlFor="cache-ttl" className="text-sm">
                    Cache timeout (minutes)
                  </Label>
                  <Input
                    id="cache-ttl"
                    type="number"
                    min={1}
                    max={1440}
                    value={cacheTtlMinutes}
                    onChange={(e) =>
                      setCacheTtlMinutes(Math.max(1, Number(e.target.value)))
                    }
                    className="w-24"
                  />
                  <p className="text-xs text-muted-foreground">
                    Results reused for up to {cacheTtlMinutes} minute
                    {cacheTtlMinutes !== 1 ? "s" : ""}.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-4 border-t pt-4">
              <h4 className="text-xs font-medium uppercase text-muted-foreground tracking-wider">
                Interactivity
              </h4>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="click-action"
                  checked={clickActionEnabled}
                  onCheckedChange={(c) => setClickActionEnabled(!!c)}
                />
                <Label htmlFor="click-action" className="text-sm">
                  Enable click action
                </Label>
              </div>
              {clickActionEnabled && (
                <div className="pl-6 space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="click-param" className="text-sm">
                      Parameter Name
                    </Label>
                    <Input
                      id="click-param"
                      value={clickParamName}
                      onChange={(e) => setClickParamName(e.target.value)}
                      placeholder="e.g. selected_country"
                    />
                    <p className="text-xs text-muted-foreground">
                      Other widgets reference this as{" "}
                      <code className="bg-muted px-1 py-0.5 rounded">
                        $param_{clickParamName || "name"}
                      </code>
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="source-field" className="text-sm">
                      Source Field
                    </Label>
                    <Input
                      id="source-field"
                      value={sourceField}
                      onChange={(e) => setSourceField(e.target.value)}
                      placeholder="e.g. country_code"
                    />
                    <p className="text-xs text-muted-foreground">
                      The data field sent when a chart element is clicked.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {isParamSelect && (
          <p className="text-sm text-muted-foreground">
            No advanced options for parameter widgets.
          </p>
        )}
      </div>
    );

    // ── PREVIEW PANEL ───────────────────────────────────────────

    const preview = (() => {
      if (isParamSelect) {
        return (
          <div className="h-full flex items-center justify-center p-6">
            <div className="w-full max-w-xs space-y-4">
              <Label className="text-xs text-muted-foreground block">
                {paramName ? `$param_${paramName}` : "Parameter preview"}
              </Label>
              {paramUIType === "freetext" && (
                <TextInputParameter
                  parameterName={paramName || "preview"}
                  value={previewTextValue}
                  onChange={setPreviewTextValue}
                  placeholder={
                    (chartOptions.placeholder as string) || "Type a value..."
                  }
                />
              )}
              {paramUIType === "date" && dateSub === "single" && (
                <DatePickerParameter
                  parameterName={paramName || "preview"}
                  value={previewDateValue}
                  onChange={setPreviewDateValue}
                />
              )}
              {paramUIType === "date" && dateSub === "range" && (
                <DateRangeParameter
                  parameterName={paramName || "preview"}
                  from={previewDateFrom}
                  to={previewDateTo}
                  onChange={(f, t) => {
                    setPreviewDateFrom(f);
                    setPreviewDateTo(t);
                  }}
                />
              )}
              {paramUIType === "date" && dateSub === "relative" && (
                <DateRelativePicker
                  parameterName={paramName || "preview"}
                  value={previewRelValue}
                  onChange={setPreviewRelValue}
                />
              )}
              {paramUIType === "select" && !multiSelect && (
                <ParamSelector
                  parameterName={paramName || "preview"}
                  value={previewSelectValue}
                  onChange={setPreviewSelectValue}
                  options={SAMPLE_OPTIONS}
                  placeholder={
                    (chartOptions.placeholder as string) || "Select..."
                  }
                  searchable={!!chartOptions.searchable}
                />
              )}
              {paramUIType === "select" && multiSelect && (
                <ParamMultiSelector
                  parameterName={paramName || "preview"}
                  values={previewMultiValues}
                  onChange={setPreviewMultiValues}
                  options={SAMPLE_OPTIONS}
                  placeholder={
                    (chartOptions.placeholder as string) || "Select..."
                  }
                  searchable={!!chartOptions.searchable}
                />
              )}
            </div>
          </div>
        );
      }

      // Chart preview: show a sample bar chart
      return (
        <div className="h-full w-full p-4">
          <BarChart
            data={SAMPLE_BAR_DATA}
            showLegend
            showGridLines
            showValues
          />
        </div>
      );
    })();

    // ── RENDER ───────────────────────────────────────────────────

    return (
      <div className="border rounded-xl bg-background shadow-lg max-w-6xl mx-auto my-6">
        {/* Dialog header */}
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Add Widget</h2>
        </div>

        {/* Two-column body — always 2 cols (no responsive prefix) */}
        <div
          className="p-6 min-h-[520px]"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
            gap: "1.5rem",
          }}
        >
          {/* ─── Left column: settings ─── */}
          <div className="overflow-y-auto max-h-[560px] pr-2">
            <ChartSettingsPanel
              dataTab={
                <div className="space-y-4">
                  {/* Widget title */}
                  <div className="space-y-1.5">
                    <Label htmlFor="widget-title">Widget Title</Label>
                    <Input
                      id="widget-title"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Optional custom title"
                    />
                  </div>

                  {/* Connection — influences available chart types */}
                  <div className="space-y-1.5">
                    <Label>Connection</Label>
                    <Select defaultValue="pg-demo">
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pg-demo">PostgreSQL (demo)</SelectItem>
                        <SelectItem value="neo4j-demo">Neo4j (movies)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Chart type dropdown with icons */}
                  <div className="space-y-1.5">
                    <Label>Chart Type</Label>
                    <Select
                      value={chartType}
                      onValueChange={(t) => {
                        setChartType(t);
                        setChartOptions({});
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select chart type..." />
                      </SelectTrigger>
                      <SelectContent>
                        {chartTypes.map((type) => {
                          const m = chartTypeMeta[type];
                          const Icon = m.Icon;
                          return (
                            <SelectItem key={type} value={type}>
                              <span className="flex items-center gap-2">
                                <Icon className="h-4 w-4" />
                                {m.label}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Query or parameter config */}
                  {dataTab}
                </div>
              }
              styleTab={styleTab}
              advancedTab={advancedTab}
            />
          </div>

          {/* ─── Right column: preview ─── */}
          <div className="flex flex-col">
            <Label className="mb-2">Preview</Label>
            <div className="flex-1 border rounded-lg min-h-[400px] relative bg-muted/5">
              {preview}
            </div>
            {isParamSelect && paramName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Resolved type:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  {resolvedType}
                </code>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t px-6 py-4 flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button disabled={!canSave}>Add Widget</Button>
        </div>
      </div>
    );
  },
};

// ── Parameter Select story ──────────────────────────────────────────

export const ParameterSelect: Story = {
  name: "Parameter Select Mode",
  render: () => {
    const [paramUIType, setParamUIType] = useState<ParamUIType>("select");
    const [dateSub, setDateSub] = useState<DateSubType>("single");
    const [multiSelect, setMultiSelect] = useState(false);
    const [paramName, setParamName] = useState("country");
    const [seedQuery, setSeedQuery] = useState(
      "SELECT code, name FROM countries ORDER BY name"
    );
    const [chartOptions, setChartOptions] = useState<
      Record<string, unknown>
    >({});

    // Preview state
    const [previewTextValue, setPreviewTextValue] = useState("");
    const [previewDateValue, setPreviewDateValue] = useState("");
    const [previewDateFrom, setPreviewDateFrom] = useState("");
    const [previewDateTo, setPreviewDateTo] = useState("");
    const [previewRelValue, setPreviewRelValue] = useState<
      RelativeDatePreset | ""
    >("");
    const [previewSelectValue, setPreviewSelectValue] = useState("");
    const [previewMultiValues, setPreviewMultiValues] = useState<string[]>(
      []
    );

    const resolvedType = useMemo(
      () => resolveInternalParamType(paramUIType, dateSub, multiSelect),
      [paramUIType, dateSub, multiSelect]
    );

    const canSave =
      paramName.trim().length > 0 &&
      (paramUIType !== "select" || seedQuery.trim().length > 0);

    const dataTab = (
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label>Parameter Type</Label>
          <Select
            value={paramUIType}
            onValueChange={(v) => setParamUIType(v as ParamUIType)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select parameter type..." />
            </SelectTrigger>
            <SelectContent>
              {paramTypes.map((type) => {
                const m = paramTypeMeta[type];
                const Icon = m.Icon;
                return (
                  <SelectItem key={type} value={type}>
                    <span className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {m.label}
                    </span>
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        {paramUIType === "date" && (
          <div className="space-y-1.5">
            <Label>Date Mode</Label>
            <Select
              value={dateSub}
              onValueChange={(v) => setDateSub(v as DateSubType)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Date</SelectItem>
                <SelectItem value="range">Date Range</SelectItem>
                <SelectItem value="relative">Relative Date</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {paramUIType === "select" && (
          <div className="flex items-center gap-2">
            <Checkbox
              id="multi-toggle-ps"
              checked={multiSelect}
              onCheckedChange={(c) => setMultiSelect(!!c)}
            />
            <Label htmlFor="multi-toggle-ps" className="text-sm">
              Allow multiple selections
            </Label>
          </div>
        )}

        {paramUIType === "select" && (
          <div className="space-y-1.5">
            <Label>
              Connection <span className="text-destructive">*</span>
            </Label>
            <Select defaultValue="pg-demo">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pg-demo">PostgreSQL (demo)</SelectItem>
                <SelectItem value="neo4j-demo">Neo4j (movies)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {paramUIType === "select" && (
          <div className="space-y-1.5">
            <Label htmlFor="seed-query-ps">
              Seed Query <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              First column = value, second column = label
            </p>
            <Textarea
              id="seed-query-ps"
              value={seedQuery}
              onChange={(e) => setSeedQuery(e.target.value)}
              placeholder="SELECT DISTINCT value FROM table ORDER BY value"
              className="font-mono min-h-[80px]"
              rows={3}
            />
            <Button type="button" variant="outline" size="sm">
              Test Seed Query
            </Button>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="param-name-ps">
            Parameter Name <span className="text-destructive">*</span>
          </Label>
          <Input
            id="param-name-ps"
            value={paramName}
            onChange={(e) => setParamName(e.target.value)}
            placeholder="e.g. country"
          />
          <p className="text-xs text-muted-foreground">
            Used to reference this parameter in widget queries
          </p>
        </div>

        {paramName && (
          <div className="border-t pt-4 space-y-1.5 text-xs text-muted-foreground">
            <p className="text-sm font-medium text-foreground">
              Reference in queries
            </p>
            <p>
              Use:{" "}
              <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                $param_{paramName}
              </code>
            </p>
            {paramUIType === "date" &&
              (dateSub === "range" || dateSub === "relative") && (
                <p>
                  Sub-parameters:{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    $param_{paramName}_from
                  </code>
                  ,{" "}
                  <code className="bg-muted px-1 py-0.5 rounded text-foreground">
                    $param_{paramName}_to
                  </code>
                </p>
              )}
          </div>
        )}
      </div>
    );

    const styleTab = (
      <ChartOptionsPanel
        chartType="parameter-select"
        settings={chartOptions}
        onSettingsChange={setChartOptions}
      />
    );

    const advancedTab = (
      <p className="text-sm text-muted-foreground">
        No advanced options for parameter widgets.
      </p>
    );

    const preview = (
      <div className="h-full flex items-center justify-center p-6">
        <div className="w-full max-w-xs space-y-4">
          <Label className="text-xs text-muted-foreground block">
            {paramName ? `$param_${paramName}` : "Parameter preview"}
          </Label>
          {paramUIType === "freetext" && (
            <TextInputParameter
              parameterName={paramName || "preview"}
              value={previewTextValue}
              onChange={setPreviewTextValue}
              placeholder={
                (chartOptions.placeholder as string) || "Type a value..."
              }
            />
          )}
          {paramUIType === "date" && dateSub === "single" && (
            <DatePickerParameter
              parameterName={paramName || "preview"}
              value={previewDateValue}
              onChange={setPreviewDateValue}
            />
          )}
          {paramUIType === "date" && dateSub === "range" && (
            <DateRangeParameter
              parameterName={paramName || "preview"}
              from={previewDateFrom}
              to={previewDateTo}
              onChange={(f, t) => {
                setPreviewDateFrom(f);
                setPreviewDateTo(t);
              }}
            />
          )}
          {paramUIType === "date" && dateSub === "relative" && (
            <DateRelativePicker
              parameterName={paramName || "preview"}
              value={previewRelValue}
              onChange={setPreviewRelValue}
            />
          )}
          {paramUIType === "select" && !multiSelect && (
            <ParamSelector
              parameterName={paramName || "preview"}
              value={previewSelectValue}
              onChange={setPreviewSelectValue}
              options={SAMPLE_OPTIONS}
              placeholder={
                (chartOptions.placeholder as string) || "Select..."
              }
              searchable={!!chartOptions.searchable}
            />
          )}
          {paramUIType === "select" && multiSelect && (
            <ParamMultiSelector
              parameterName={paramName || "preview"}
              values={previewMultiValues}
              onChange={setPreviewMultiValues}
              options={SAMPLE_OPTIONS}
              placeholder={
                (chartOptions.placeholder as string) || "Select..."
              }
              searchable={!!chartOptions.searchable}
            />
          )}
        </div>
      </div>
    );

    return (
      <div className="border rounded-xl bg-background shadow-lg max-w-6xl mx-auto my-6">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold">Add Parameter Widget</h2>
        </div>

        <div
          className="p-6 min-h-[520px]"
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 3fr) minmax(0, 2fr)",
            gap: "1.5rem",
          }}
        >
          {/* Left: settings */}
          <div className="overflow-y-auto max-h-[560px] pr-2">
            <ChartSettingsPanel
              dataTab={
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <Label>Widget Title</Label>
                    <Input placeholder="Optional custom title" />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Chart Type</Label>
                    <Select value="parameter-select" disabled>
                      <SelectTrigger>
                        <SelectValue>
                          <span className="flex items-center gap-2">
                            <SlidersHorizontal className="h-4 w-4" />
                            Parameter Selector
                          </span>
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="parameter-select">
                          Parameter Selector
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {dataTab}
                </div>
              }
              styleTab={styleTab}
              advancedTab={advancedTab}
            />
          </div>

          {/* Right: preview */}
          <div className="flex flex-col">
            <Label className="mb-2">Preview</Label>
            <div className="flex-1 border rounded-lg min-h-[400px] relative bg-muted/5">
              {preview}
            </div>
            {paramName && (
              <p className="mt-2 text-xs text-muted-foreground">
                Resolved type:{" "}
                <code className="bg-muted px-1 py-0.5 rounded">
                  {resolvedType}
                </code>
              </p>
            )}
          </div>
        </div>

        <div className="border-t px-6 py-4 flex justify-end gap-2">
          <Button variant="outline">Cancel</Button>
          <Button disabled={!canSave}>Add Widget</Button>
        </div>
      </div>
    );
  },
};
