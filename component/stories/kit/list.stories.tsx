import type { Meta, StoryObj } from "@storybook/react";
import { MoreHorizontal } from "lucide-react";
import { expect, within } from "storybook/test";
import { List, ListRow } from "@/components/kit/list";

type Args = {
  label: string;
  rows: number;
  showDescription: boolean;
};

const items = [
  [
    "Movie highlights",
    "The movie graph on Neo4j and its relational copy",
    "Alice Demo",
    "12",
    "3 min ago",
  ],
  [
    "Chart gallery",
    "One page per chart type the picker offers",
    "Alice Demo",
    "37",
    "1 h ago",
  ],
  [
    "Click actions",
    "Three click-action types end to end",
    "Alice Demo",
    "14",
    "Yesterday",
  ],
  [
    "Chart reference",
    "Every customization, one page per chart",
    "Bob Creator",
    "270",
    "2 d ago",
  ],
  [
    "Transformations",
    "Before and after, for each supported transform",
    "Alice Demo",
    "18",
    "5 d ago",
  ],
];

const meta = {
  title: "Kit/List",
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    label: { control: "text" },
    rows: { control: { type: "number", min: 1, max: 5 } },
    showDescription: { control: "boolean" },
  },
  args: { label: "Dashboards", rows: 5, showDescription: true },
  render: ({ label, rows, showDescription }: Args) => (
    <List label={label} columns={["Name", "Owner", "Widgets", "Updated"]}>
      {items.slice(0, rows).map(([name, desc, owner, widgets, updated]) => (
        <ListRow
          key={name}
          title={name}
          description={showDescription ? desc : undefined}
          href="#"
          meta={[owner, widgets, updated]}
          menu={
            <button
              type="button"
              aria-label={`Actions for ${name}`}
              className="grid h-[30px] w-[30px] place-items-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </button>
          }
        />
      ))}
    </List>
  ),
} satisfies Meta<Args>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const NoDescriptions: Story = { args: { showDescription: false } };
export const Dark: Story = { globals: { theme: "dark" } };

// The row is a <tr>; its name link's ::after stretches over it. Hit-testing a
// point in a meta cell must land on the link, and one on the "⋯" on the button.
export const WholeRowOpens: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const link = canvas.getByRole("link", { name: "Movie highlights" });
    const row = link.closest("tr")!;
    const owner = within(row).getByText("Alice Demo").getBoundingClientRect();
    await expect(
      document.elementFromPoint(
        owner.left + owner.width / 2,
        owner.top + owner.height / 2,
      ),
    ).toBe(link);
    const menu = within(row).getByRole("button");
    const m = menu.getBoundingClientRect();
    const hit = document.elementFromPoint(
      m.left + m.width / 2,
      m.top + m.height / 2,
    );
    await expect(menu.contains(hit)).toBe(true);
  },
};
