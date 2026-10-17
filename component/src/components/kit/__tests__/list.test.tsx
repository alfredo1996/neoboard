import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { List, ListRow } from "../list";

function setup() {
  const onOpen = vi.fn();
  const onMenu = vi.fn();
  render(
    <List label="Dashboards" columns={["Name", "Owner"]}>
      <ListRow
        title="Movie highlights"
        description="The movie graph"
        href="/d/1"
        onOpen={onOpen}
        meta={["Alice Demo"]}
        menu={
          <button
            type="button"
            aria-label="Actions for Movie highlights"
            onClick={onMenu}
          >
            more
          </button>
        }
      />
    </List>,
  );
  return { onOpen, onMenu };
}

describe("ListRow", () => {
  it("opens the item through one stretched link", () => {
    const { onOpen } = setup();
    const link = screen.getByRole("link", { name: "Movie highlights" });
    expect(link).toHaveAttribute("href", "/d/1");
    // The link's ::after covers the row: it carries the stretch class.
    expect(link.className).toMatch(/after:absolute/);
    fireEvent.click(link);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("keeps the menu button separately clickable and outside the link", () => {
    const { onOpen, onMenu } = setup();
    const menu = screen.getByRole("button", { name: /Actions for/ });
    expect(menu.closest("a")).toBeNull();
    fireEvent.click(menu);
    expect(onMenu).toHaveBeenCalledTimes(1);
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("labels the list and its column headers", () => {
    setup();
    expect(
      screen.getByRole("table", { name: "Dashboards" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("columnheader").map((h) => h.textContent),
    ).toEqual(["Name", "Owner", "Actions"]);
  });
});
