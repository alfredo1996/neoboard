import type { Meta, StoryObj } from "@storybook/react";
import { expect, screen, userEvent, within } from "storybook/test";
import {
  FiltersButton,
  type FiltersButtonItem,
} from "@/components/kit/filters-button";

const VALUES = [
  "1990s",
  "Tom Hanks",
  "Europe",
  "A rather long value that has to truncate",
  "7",
  "United States of America",
  "Drama, Comedy, Thriller",
  undefined,
  "2024-01-01 to 2024-12-31",
  "NYC",
];

const items: FiltersButtonItem[] = Array.from({ length: 14 }, (_, i) => {
  const label = ["Decade", "Actor", "Continent", "Genre", "Rating"][i % 5];
  return {
    id: `f${i}`,
    label: `${label} ${i + 1}`,
    value: VALUES[i % VALUES.length],
    where: i % 3 === 0 ? "on 5. Geographic" : `${label} by year on Overview`,
    onSelect: () => {},
  };
});

const meta = {
  title: "Kit/FiltersButton",
  component: FiltersButton,
  parameters: { layout: "padded" },
  args: {
    items,
    onClear: () => {},
    onClearAll: () => {},
    barShown: true,
    onShowChange: () => {},
  },
  decorators: [
    (Story) => (
      <div className="flex h-[520px] justify-end">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FiltersButton>;

export default meta;
type Story = StoryObj<typeof meta>;

const openMenu = async (canvasElement: HTMLElement) => {
  await userEvent.click(
    within(canvasElement).getByRole("button", { name: /^Filters/ }),
  );
  return screen.findByRole("dialog", { name: "Filters" });
};

/** Many filters with values of mixed length, the menu open. */
export const ManyFilters: Story = {
  play: async ({ canvasElement }) => {
    const menu = await openMenu(canvasElement);
    // Real layout: jsdom cannot measure, so this runs in the browser projects.
    const values = Array.from(
      menu.querySelectorAll<HTMLElement>("[data-filter-value]"),
    ).map((el) => el.getBoundingClientRect());
    expect(values.length).toBeGreaterThan(5);
    for (const r of values) {
      expect(r.left).toBe(values[0].left);
      expect(r.width).toBe(values[0].width);
    }
    // Each × sits on its value's line.
    for (const li of Array.from(menu.querySelectorAll("li"))) {
      const value = li.querySelector("[data-filter-value]");
      const clear = li.querySelector("button[aria-label^='Clear ']");
      if (!value || !clear) continue;
      const v = value.getBoundingClientRect();
      const c = clear.getBoundingClientRect();
      expect(c.top + c.height / 2).toBeGreaterThan(v.top);
      expect(c.top + c.height / 2).toBeLessThan(v.bottom);
    }
    // The jump button covers each value, so a truncated value's full text is
    // that button's title (a title on the value itself is never reached).
    for (const el of Array.from(
      menu.querySelectorAll<HTMLElement>("[data-filter-value]"),
    )) {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const hit = document.elementFromPoint(
        r.left + r.width / 2,
        r.top + r.height / 2,
      );
      const title = hit?.closest("button")?.getAttribute("title");
      expect(title).toContain(el.textContent);
    }
  },
};
export const ManyFiltersDark: Story = {
  globals: { theme: "dark" },
  play: ManyFilters.play,
};
