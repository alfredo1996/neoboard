import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Tabs, TabsList, TabsTrigger } from "../tabs";

const labels = ["One", "Two", "Three", "Four"];

function Row({
  value,
  onValueChange,
}: Readonly<{ value?: string; onValueChange?: (v: string) => void }>) {
  return (
    <Tabs
      {...(value === undefined
        ? { defaultValue: "One" }
        : { value, onValueChange })}
    >
      <TabsList aria-label="Demo">
        {labels.map((l) => (
          <TabsTrigger key={l} value={l}>
            {l}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

const scrollIntoView = vi.fn();
const proto = Element.prototype as { scrollIntoView?: unknown };

beforeEach(() => {
  scrollIntoView.mockClear();
  proto.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  // jsdom has none; leave it as found
  delete proto.scrollIntoView;
});

describe("Tabs (#2221)", () => {
  it("has one tab stop, on the selected tab", () => {
    const { container } = render(<Row />);
    expect(container.querySelectorAll("[tabindex='0']")).toHaveLength(1);
    expect(
      container.querySelectorAll("button:not([tabindex='-1'])"),
    ).toHaveLength(0);
  });

  it("arrows, Home and End move focus without selecting", async () => {
    const user = userEvent.setup();
    render(<Row />);
    await user.tab();
    expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Two" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "One" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Four" })).toHaveFocus();
    await user.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "One" })).toHaveFocus();
  });

  it.each([["{Enter}"], [" "]])("%j selects the focused tab", async (key) => {
    const user = userEvent.setup();
    render(<Row />);
    await user.tab();
    await user.keyboard("{ArrowRight}");
    await user.keyboard(key);
    expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("scrolls a focused tab into view, nearest, never the page", async () => {
    const user = userEvent.setup();
    render(<Row />);
    await user.tab();
    scrollIntoView.mockClear();
    await user.keyboard("{ArrowRight}");
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(
      screen.getByRole("tab", { name: "Two" }),
    );
  });

  it("scrolls the selected tab into view on mount and on a click", async () => {
    const user = userEvent.setup();
    render(<Row />);
    expect(scrollIntoView.mock.contexts).toContain(
      screen.getByRole("tab", { name: "One" }),
    );
    await user.click(screen.getByRole("tab", { name: "Three" }));
    expect(scrollIntoView.mock.contexts).toContain(
      screen.getByRole("tab", { name: "Three" }),
    );
  });

  it("scrolls the new tab into view when the value changes from outside", async () => {
    const { rerender } = render(<Row value="One" />);
    scrollIntoView.mockClear();
    rerender(<Row value="Four" />);
    await waitFor(() =>
      expect(scrollIntoView.mock.contexts).toContain(
        screen.getByRole("tab", { name: "Four" }),
      ),
    );
  });

  it("has no pill variant", () => {
    render(
      <Tabs defaultValue="a">
        <TabsList
          // @ts-expect-error the variant prop is gone
          variant="pill"
        >
          <TabsTrigger value="a">A</TabsTrigger>
        </TabsList>
      </Tabs>,
    );
    expect(screen.getByRole("tablist").className).not.toMatch(/bg-muted/);
  });
});

describe("Tabs edge buttons (#2221)", () => {
  function overflow(
    list: HTMLElement,
    m: { scrollWidth: number; clientWidth: number; scrollLeft: number },
  ) {
    for (const [k, v] of Object.entries(m)) {
      Object.defineProperty(list, k, { configurable: true, value: v });
    }
    act(() => {
      fireEvent.scroll(list);
    });
  }

  it("shows no button when the row fits", () => {
    render(<Row />);
    overflow(screen.getByRole("tablist"), {
      scrollWidth: 300,
      clientWidth: 300,
      scrollLeft: 0,
    });
    expect(screen.queryByLabelText(/Scroll tabs/)).toBeNull();
  });

  it("shows only the right button at the start, only the left at the end, both between", () => {
    render(<Row />);
    const list = screen.getByRole("tablist");
    overflow(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: 0 });
    expect(screen.queryByLabelText("Scroll tabs left")).toBeNull();
    expect(screen.getByLabelText("Scroll tabs right")).toBeInTheDocument();
    overflow(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: 300 });
    expect(screen.getByLabelText("Scroll tabs left")).toBeInTheDocument();
    expect(screen.getByLabelText("Scroll tabs right")).toBeInTheDocument();
    overflow(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: 600 });
    expect(screen.getByLabelText("Scroll tabs left")).toBeInTheDocument();
    expect(screen.queryByLabelText("Scroll tabs right")).toBeNull();
  });

  it("the buttons are not tab stops and scroll about 70% of the width", () => {
    render(<Row />);
    const list = screen.getByRole("tablist");
    const scrollBy = vi.fn();
    list.scrollBy = scrollBy;
    overflow(list, { scrollWidth: 900, clientWidth: 300, scrollLeft: 300 });
    const right = screen.getByLabelText("Scroll tabs right");
    expect(right.tabIndex).toBe(-1);
    expect(screen.getByLabelText("Scroll tabs left").tabIndex).toBe(-1);
    fireEvent.click(right);
    expect(scrollBy).toHaveBeenCalledWith(
      expect.objectContaining({ left: 210 }),
    );
    fireEvent.click(screen.getByLabelText("Scroll tabs left"));
    expect(scrollBy).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: -210 }),
    );
  });
});
