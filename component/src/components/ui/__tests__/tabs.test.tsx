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

  it.each([["{Enter}"], [" "]])(
    "%j selects the focused tab, an arrow alone does not",
    async (key) => {
      const user = userEvent.setup();
      render(<Row />);
      await user.tab();
      await user.keyboard("{ArrowRight}");
      expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute(
        "aria-selected",
        "false",
      );
      await user.keyboard(key);
      expect(screen.getByRole("tab", { name: "Two" })).toHaveAttribute(
        "aria-selected",
        "true",
      );
    },
  );

  /** Lay the row out: 100px tabs, a 300px viewport, scrolled to `scrollLeft`. */
  function layout(scrollLeft: number) {
    const list = screen.getByRole("tablist");
    Object.defineProperty(list, "clientWidth", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(list, "scrollWidth", {
      configurable: true,
      value: 900,
    });
    Object.defineProperty(list, "offsetLeft", { configurable: true, value: 0 });
    list.scrollLeft = scrollLeft;
    labels.forEach((l, i) => {
      const t = screen.getByRole("tab", { name: l });
      Object.defineProperty(t, "offsetLeft", {
        configurable: true,
        value: i * 200,
      });
      Object.defineProperty(t, "offsetWidth", {
        configurable: true,
        value: 100,
      });
    });
    const scrollTo = vi.fn();
    list.scrollTo = scrollTo;
    return scrollTo;
  }

  it("a focused tab past the right edge scrolls the row, never an ancestor", async () => {
    const user = userEvent.setup();
    render(<Row />);
    const scrollTo = layout(0);
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}"); // Three: 400..500, 300 wide
    // right edge 500 + 56 padding - 300 wide
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 256 }),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("a tab already clear of the edges does not scroll", async () => {
    const user = userEvent.setup();
    render(<Row />);
    const scrollTo = layout(0);
    await user.tab();
    await user.keyboard("{ArrowRight}"); // Two: 200..300 + 56 = 356 > 300 -> scrolls
    scrollTo.mockClear();
    layout(100); // viewport 100..400, Two sits at 200..300: clear
    await user.keyboard("{ArrowLeft}{ArrowRight}");
    expect(scrollTo).not.toHaveBeenCalled();
  });

  it("scrolls left to reveal a tab hidden before the viewport", async () => {
    const user = userEvent.setup();
    render(<Row />);
    const scrollTo = layout(600);
    await user.tab();
    // One (0..100) is before the viewport
    await user.keyboard("{Home}");
    expect(scrollTo).toHaveBeenLastCalledWith(
      expect.objectContaining({ left: 0 }),
    );
  });

  it("reveals the selected tab on a click without touching ancestors", async () => {
    const user = userEvent.setup();
    render(<Row />);
    const scrollTo = layout(0);
    await user.click(screen.getByRole("tab", { name: "Four" })); // 600..700
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ left: 456 }),
      ),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("reveals the new tab when the value changes from outside", async () => {
    const { rerender } = render(<Row value="One" />);
    const scrollTo = layout(0);
    rerender(<Row value="Four" />);
    await waitFor(() =>
      expect(scrollTo).toHaveBeenLastCalledWith(
        expect.objectContaining({ left: 456 }),
      ),
    );
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("keeps a caller's onFocus and onScroll next to the built-in ones", async () => {
    const user = userEvent.setup();
    const onFocus = vi.fn();
    const onScroll = vi.fn();
    render(
      <Tabs defaultValue="One">
        <TabsList aria-label="Demo" onFocus={onFocus} onScroll={onScroll}>
          {labels.map((l) => (
            <TabsTrigger key={l} value={l}>
              {l}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>,
    );
    const list = screen.getByRole("tablist");
    const scrollTo = layout(0);
    await user.tab();
    await user.keyboard("{ArrowRight}{ArrowRight}");
    expect(onFocus).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalled(); // built-in still ran
    Object.defineProperty(list, "scrollLeft", {
      configurable: true,
      value: 300,
    });
    act(() => {
      fireEvent.scroll(list);
    });
    expect(onScroll).toHaveBeenCalled();
    expect(screen.getByLabelText("Scroll tabs left")).toBeInTheDocument();
  });

  it("re-measures when a tab's text changes width", async () => {
    const { rerender } = render(<Row />);
    const list = screen.getByRole("tablist");
    Object.defineProperty(list, "clientWidth", {
      configurable: true,
      value: 300,
    });
    Object.defineProperty(list, "scrollWidth", {
      configurable: true,
      value: 300,
    });
    rerender(<Row />);
    expect(screen.queryByLabelText(/Scroll tabs/)).toBeNull();
    Object.defineProperty(list, "scrollWidth", {
      configurable: true,
      value: 900,
    });
    screen.getByRole("tab", { name: "One" }).firstChild!.textContent =
      "A much longer name";
    await waitFor(() =>
      expect(screen.getByLabelText("Scroll tabs right")).toBeInTheDocument(),
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
