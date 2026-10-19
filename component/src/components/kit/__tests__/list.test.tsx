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

  it("reads the description at 4.5:1 on the hovered row fill", () => {
    setup();
    expect(screen.getByText("The movie graph").className).toContain(
      "text-foreground-2",
    );
  });

  it("keeps a cell passed as an array in one column", () => {
    render(
      <List label="L" columns={["Name", "Owner", "Widgets"]}>
        <ListRow
          title="Row"
          href="/r"
          meta={[["Alice", <i key="t">Shared</i>], 12]}
        />
      </List>,
    );
    const cells = screen.getAllByRole("cell");
    // title, two meta cells, menu
    expect(cells).toHaveLength(4);
    expect(cells[1]).toHaveTextContent("AliceShared");
    expect(cells[2]).toHaveTextContent("12");
  });

  it("is a native table: th scope=col headers, tr rows, td cells", () => {
    setup();
    const table = screen.getByRole("table", { name: "Dashboards" });
    expect(table.tagName).toBe("TABLE");
    for (const h of screen.getAllByRole("columnheader")) {
      expect(h.tagName).toBe("TH");
      expect(h).toHaveAttribute("scope", "col");
    }
    for (const r of screen.getAllByRole("row")) expect(r.tagName).toBe("TR");
    for (const c of screen.getAllByRole("cell")) expect(c.tagName).toBe("TD");
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

describe("List sorting", () => {
  function sortable(
    sort?: { column: string; direction: "ascending" | "descending" },
    onSort = vi.fn(),
  ) {
    render(
      <List
        label="Users"
        columns={["Name", "Role"]}
        sort={sort}
        onSort={onSort}
      >
        <ListRow title="Alice" meta={["Admin"]} />
      </List>,
    );
    return onSort;
  }

  it("renders each column header as a sort button and reports the column clicked", () => {
    const onSort = sortable();
    fireEvent.click(screen.getByRole("button", { name: "Role" }));
    expect(onSort).toHaveBeenCalledExactlyOnceWith("Role");
    // The menu column is not sortable.
    expect(screen.queryByRole("button", { name: "Actions" })).toBeNull();
  });

  it("marks only the sorted column with aria-sort, in its direction", () => {
    sortable({ column: "Role", direction: "descending" });
    const [name, role] = screen.getAllByRole("columnheader");
    expect(role).toHaveAttribute("aria-sort", "descending");
    expect(name).toHaveAttribute("aria-sort", "none");
  });

  it("leaves headers as plain text when the caller passes no handler", () => {
    render(
      <List label="L" columns={["Name"]}>
        <ListRow title="Row" href="/r" />
      </List>,
    );
    expect(screen.queryByRole("button", { name: "Name" })).toBeNull();
    expect(
      screen.getByRole("columnheader", { name: "Name" }),
    ).not.toHaveAttribute("aria-sort");
  });
});

describe("ListRow without a link target", () => {
  it("opens through a button when it has only onOpen", () => {
    const onOpen = vi.fn();
    render(
      <List label="L" columns={["Name"]}>
        <ListRow title="Prod db" onOpen={onOpen} />
      </List>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Prod db" }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("is plain text when it opens nothing", () => {
    render(
      <List label="L" columns={["Name"]}>
        <ListRow title="Carol" />
      </List>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Carol")).toBeInTheDocument();
  });
});

describe("ListRow title: opener and tooltip (#2254)", () => {
  it.each([
    ["a link", { href: "/d/1", onOpen: vi.fn() }, "link"],
    ["a button", { onOpen: vi.fn() }, "button"],
    ["plain text", {}, null],
  ])(
    "%s carries the full name as a tooltip, for when it truncates",
    (_, props, role) => {
      render(
        <List label="L" columns={["Name"]}>
          <ListRow title="A very long connection name" {...props} />
        </List>,
      );
      const el = role
        ? screen.getByRole(role as "link" | "button")
        : screen.getByText("A very long connection name");
      expect(el).toHaveAttribute("title", "A very long connection name");
    },
  );

  it.each([
    ["link", { href: "/d/1" }],
    ["button", {}],
  ])("hands the %s it was opened from to onOpen", (role, props) => {
    const onOpen = vi.fn();
    render(
      <List label="L" columns={["Name"]}>
        <ListRow title="Prod db" onOpen={onOpen} {...props} />
      </List>,
    );
    const el = screen.getByRole(role as "link" | "button");
    fireEvent.click(el);
    expect(onOpen).toHaveBeenCalledWith(el);
  });
});
