import type { Meta, StoryObj } from "@storybook/react";
import { WidgetCard } from "@/components/composed/widget-card";
import { expect } from "storybook/test";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { ParamMultiSelector } from "@/components/composed/parameter-widgets/param-multi-selector";
import { ParamSelector } from "@/components/composed/parameter-widgets/param-selector";
import { TextInputParameter } from "@/components/composed/parameter-widgets/text-input";
import { DateRangeParameter } from "@/components/composed/parameter-widgets/date-range-picker";
import { DatePickerParameter } from "@/components/composed/parameter-widgets/date-picker";
import { NumberRangeSlider } from "@/components/composed/parameter-widgets/number-range-slider";

const meta = {
  title: "Composed/WidgetCard",
  component: WidgetCard,
  parameters: { layout: "centered" },
  tags: ["autodocs"],
  argTypes: {
    title: { control: "text" },
    source: { control: "text" },
    mode: {
      control: "inline-radio",
      options: ["view", "edit"],
      description:
        "View fades the actions in; edit shows the handle and a dashed edge.",
    },
    titleFont: {
      control: "inline-radio",
      options: ["sans", "serif"],
      description: "The title face. The KPI number follows it.",
    },
    headerRule: {
      control: "boolean",
      description: "The hairline between header and body.",
    },
    elevation: {
      control: "boolean",
      description: "The card's light shadow. Edit mode never has one.",
    },
  },
  args: {
    mode: "view",
    titleFont: "sans",
    headerRule: true,
    elevation: true,
  },
} satisfies Meta<typeof WidgetCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: "Revenue Chart",
    source: "Monthly revenue breakdown",
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Chart content goes here
      </div>
    ),
  },
};

const body = (
  <div className="flex h-32 items-center justify-center text-muted-foreground">
    Chart content goes here
  </div>
);

/** The approved BI card, with a control for every look option (#2247). */
export const Playground: Story = {
  args: {
    title: "Movies by decade",
    source: "Movies graph · 5 rows · 2 min ago",
    onFullscreen: () => {},
    onRefresh: () => {},
    actions: [{ label: "Edit", onClick: () => {} }],
    children: body,
  },
};

export const PlaygroundDark: Story = {
  ...Playground,
  globals: { theme: "dark" },
};

export const SerifTitle: Story = {
  args: { ...Playground.args, titleFont: "serif" },
};

export const NoHeaderRule: Story = {
  args: { ...Playground.args, headerRule: false },
};

export const Flat: Story = {
  args: { ...Playground.args, elevation: false },
};

export const EditDark: Story = {
  args: { ...Playground.args, mode: "edit" },
  globals: { theme: "dark" },
};

export const WithActions: Story = {
  args: {
    title: "Active Users",
    source: "Real-time user activity",
    actions: [
      { label: "Edit", onClick: () => {} },
      { label: "Duplicate", onClick: () => {} },
      { label: "Delete", onClick: () => {}, destructive: true },
    ],
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Widget content
      </div>
    ),
  },
};

export const Draggable: Story = {
  args: {
    title: "Draggable Widget",
    mode: "edit",
    actions: [
      { label: "Configure", onClick: () => {} },
      { label: "Remove", onClick: () => {}, destructive: true },
    ],
    children: (
      <div className="flex items-center justify-center h-48 text-muted-foreground">
        Drag the handle to reorder
      </div>
    ),
  },
};

export const DashboardLayout: Story = {
  args: { title: "Dashboard", children: null },
  render: () => (
    <div className="grid gap-4 md:grid-cols-2 w-[700px]">
      <WidgetCard
        title="Revenue"
        source="Last 30 days"
        actions={[{ label: "Edit", onClick: () => {} }]}
      >
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          $45,231
        </div>
      </WidgetCard>
      <WidgetCard
        title="Users"
        source="Active this week"
        actions={[{ label: "Edit", onClick: () => {} }]}
      >
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          2,350
        </div>
      </WidgetCard>
      <WidgetCard title="Recent Orders" className="md:col-span-2">
        <div className="flex items-center justify-center h-32 text-muted-foreground">
          Table content
        </div>
      </WidgetCard>
    </div>
  ),
};

const opts = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta" },
];
const noop = () => {};

/**
 * #2357: every selector type in a two-row card (172px, the dashboard grid's
 * default) in edit mode, the tightest case (a fixed h-9 header row). jsdom has no
 * layout, so the play function measures real boxes: each field must end at or
 * above the card body's content-box bottom, so it never intrudes into the
 * body's own bottom padding. Growth in the label row turns this red.
 */
export const SelectorCardsTwoRows: Story = {
  args: { title: "Selectors", children: null },
  render: () => (
    <div className="flex gap-4">
      {[
        <TextInputParameter
          key="t"
          parameterName="text"
          value="abc"
          onChange={noop}
        />,
        <ParamSelector
          key="s"
          parameterName="select"
          options={opts}
          value="a"
          onChange={noop}
        />,
        <ParamMultiSelector
          key="m"
          parameterName="multi"
          options={opts}
          values={["a", "b"]}
          onChange={noop}
        />,
        <DatePickerParameter
          key="d"
          parameterName="date"
          value="2026-01-01"
          onChange={noop}
        />,
        <NumberRangeSlider
          key="n"
          parameterName="range"
          min={0}
          max={10}
          value={[2, 8]}
          onChange={noop}
          onClear={noop}
        />,
      ].map((field) => (
        <WidgetCard
          key={field.key}
          title="Selector"
          mode="edit"
          className={cn(
            "w-[300px]",
            field.key === "n" ? "h-[264px]" : "h-[172px]",
          )}
        >
          {field}
        </WidgetCard>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const bodies = [
      ...canvasElement.querySelectorAll<HTMLElement>(
        "[class*=overflow-hidden]",
      ),
    ].filter((b) => b.className.includes("pb-4"));
    expect(bodies).toHaveLength(5);
    for (const body of bodies) {
      const inner =
        body.getBoundingClientRect().bottom -
        Number.parseFloat(getComputedStyle(body).paddingBottom);
      const fields = body.querySelectorAll("input, button, [role=slider]");
      expect(fields.length).toBeGreaterThan(0);
      for (const f of fields) {
        expect(inner - f.getBoundingClientRect().bottom).toBeGreaterThanOrEqual(
          0,
        );
      }
    }
  },
};

/**
 * #2367: a filter card holding a field of each field-shaped type (relative date
 * is a segmented control and number range a slider: neither is a field). Every
 * field is painted with `--field` and the 3:1 `--input` border, fills the card
 * body's width, and a long value ends inside it, clear of the x. The date range
 * sits in a card about 237px wide, the narrowest a filter gets.
 */
export const FilterCardFields: Story = {
  args: { title: "Filters", children: null },
  render: () => (
    <div className="flex flex-wrap gap-4">
      {[
        <TextInputParameter
          key="t"
          parameterName="text"
          value="abc"
          onChange={noop}
        />,
        <ParamSelector
          key="s"
          parameterName="select"
          searchable
          options={opts}
          value="a"
          onChange={noop}
        />,
        <ParamSelector
          key="p"
          parameterName="plain"
          options={opts}
          value="a"
          onChange={noop}
        />,
        <ParamMultiSelector
          key="m"
          parameterName="multi"
          options={opts}
          values={["a"]}
          onChange={noop}
        />,
        <DatePickerParameter
          key="d"
          parameterName="date"
          value="2026-01-01"
          onChange={noop}
        />,
        <DateRangeParameter
          key="r"
          parameterName="range"
          from="2026-01-01"
          to="2026-12-31"
          onChange={noop}
        />,
      ].map((field) => (
        <WidgetCard
          key={field.key}
          title="Filter"
          titleIcon={<SlidersHorizontal className="h-3.5 w-3.5" />}
          className={field.key === "r" ? "w-[237px]" : "w-[300px]"}
        >
          {field}
        </WidgetCard>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const probe = document.createElement("div");
    probe.style.background = "hsl(var(--field))";
    probe.style.borderColor = "hsl(var(--input))";
    probe.style.borderStyle = "solid";
    canvasElement.append(probe);
    const fieldFill = getComputedStyle(probe).backgroundColor;
    const inputBorder = getComputedStyle(probe).borderTopColor;
    probe.remove();
    const cards = canvasElement.querySelectorAll<HTMLElement>(
      "[class*=overflow-hidden]",
    );
    const bodies = [...cards].filter((b) => b.className.includes("pb-4"));
    expect(bodies).toHaveLength(6);
    for (const body of bodies) {
      const control = body.querySelector<HTMLElement>(
        "input, button[aria-expanded]",
      )!;
      // The multi-select's trigger is an overlay; its parent draws the field.
      const field =
        getComputedStyle(control).position === "absolute"
          ? control.parentElement!
          : control;
      const bg = getComputedStyle(field).backgroundColor;
      expect(bg).toBe(fieldFill);
      expect(bg).not.toBe(getComputedStyle(body).backgroundColor);
      expect(getComputedStyle(field).borderTopColor).toBe(inputBorder);
      const inner =
        body.clientWidth -
        Number.parseFloat(getComputedStyle(body).paddingLeft) -
        Number.parseFloat(getComputedStyle(body).paddingRight);
      expect(field.getBoundingClientRect().width).toBeGreaterThanOrEqual(
        inner - 1,
      );
      // Text never runs past the field, or under the clear x beside it.
      const box = field.getBoundingClientRect();
      const clear = body.querySelector<HTMLElement>(
        "button[aria-label^=Clear], button[aria-label*=Clear]",
      );
      for (const span of field.querySelectorAll("span")) {
        const r = span.getBoundingClientRect();
        if (r.width === 0) continue;
        expect(r.right).toBeLessThanOrEqual(box.right + 0.5);
        if (clear) {
          expect(r.right).toBeLessThanOrEqual(
            clear.getBoundingClientRect().left + 0.5,
          );
        }
      }
    }
  },
};
