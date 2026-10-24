/**
 * TableRenderer through the real DataGrid: what a column filter keeps and
 * what a sort orders (#2070).
 *
 * TanStack reads the accessor's raw value, so an object column filtered on
 * "[object Object]" (a title matched nothing, "object" matched every row) and
 * sorted every value as equal. It now filters and sorts on the text its cells
 * show. A column of primitives keeps the grid's own filter and comparators.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const interpolateColor = vi.hoisted(() => vi.fn(() => "#000000"));

vi.mock("@neoboard/components", async () => {
  const { DataGrid } = await vi.importActual<
    typeof import("@neoboard/components/composed")
  >("@neoboard/components/composed");
  return {
    DataGrid,
    EmptyState: ({ title }: { title?: string }) => <div>{title}</div>,
    parseColorThresholds: () => [],
    resolveThresholdColor: () => undefined,
    interpolateColor,
    contrastTextColor: () => "#ffffff",
  };
});

import { TableRenderer } from "../table-renderer";

const node = (id: string, labels: string[], properties: object) => ({
  $type: "node",
  identity: id,
  elementId: `4:db:${id}`,
  labels,
  properties,
});

const matrix = node("1", ["Movie"], { title: "The Matrix" });
const atlas = node("2", ["Movie"], { title: "Cloud Atlas" });
const keanu = node("3", ["Person"], { name: "Keanu Reeves" });

const settings = { enablePagination: false };

/** Each body row's cell text in `column`, top to bottom. */
const shown = (column: number) =>
  Array.from(document.querySelectorAll("tbody tr")).map(
    (tr) => tr.querySelectorAll("td")[column]?.textContent ?? "",
  );

/** The column's header menu, the only path a user has to sort and filter. */
const openMenu = (column: string) =>
  userEvent.click(screen.getByRole("button", { name: column }));

const filter = async (column: string, text: string) => {
  await openMenu(column);
  await userEvent.type(screen.getByLabelText(`Filter ${column}`), text);
};

const sortAsc = async (column: string) => {
  await openMenu(column);
  await userEvent.click(
    await screen.findByRole("menuitem", { name: "Sort ascending" }),
  );
};

describe("TableRenderer filters and sorts through the grid (#2070)", () => {
  it("filters a node column by a property value, keeping the matching rows only", async () => {
    render(
      <TableRenderer
        data={[{ m: matrix }, { m: atlas }, { m: keanu }]}
        settings={settings}
      />,
    );
    await filter("m", "matrix");
    expect(shown(0)).toEqual([':Movie {title: "The Matrix"}']);
  });

  it("matches nothing when a node column is filtered by 'object'", async () => {
    render(
      <TableRenderer
        data={[{ m: matrix }, { m: atlas }]}
        settings={settings}
      />,
    );
    await filter("m", "object");
    expect(screen.getByText("No results.")).toBeInTheDocument();
  });

  it("filters a row without the column as the null its cell shows", async () => {
    // Rows cross JSON, so a missing value arrives as a missing key.
    render(
      <TableRenderer
        data={[{ m: matrix }, { m: null }, {}]}
        settings={settings}
      />,
    );
    await filter("m", "null");
    expect(shown(0)).toEqual(["null", "null"]);
  });

  it("sorts a node column by the text its cells show", async () => {
    render(
      <TableRenderer
        data={[{ m: keanu }, { m: matrix }, { m: atlas }]}
        settings={settings}
      />,
    );
    await sortAsc("m");
    expect(shown(0)).toEqual([
      ':Movie {title: "Cloud Atlas"}',
      ':Movie {title: "The Matrix"}',
      ':Person {name: "Keanu Reeves"}',
    ]);
  });

  it("sorts a node column with one shared collator, not one per comparison", async () => {
    // localeCompare with an options object builds a fresh ICU collator on
    // every call: about 190 ms of a 5000-row sort's 256 ms.
    const localeCompare = vi.spyOn(String.prototype, "localeCompare");
    try {
      render(
        <TableRenderer
          data={[{ m: keanu }, { m: matrix }, { m: atlas }]}
          settings={settings}
        />,
      );
      await sortAsc("m");
      expect(shown(0)[0]).toBe(':Movie {title: "Cloud Atlas"}');
      expect(localeCompare).not.toHaveBeenCalled();
    } finally {
      localeCompare.mockRestore();
    }
  });

  it("still sorts a number column numerically", async () => {
    render(
      <TableRenderer
        data={[{ n: 10 }, { n: 9 }, { n: 100 }]}
        settings={settings}
      />,
    );
    await sortAsc("n");
    expect(shown(0)).toEqual(["9", "10", "100"]);
  });

  it("still filters a string column case-insensitively", async () => {
    render(
      <TableRenderer
        data={[{ s: "Alice" }, { s: "bob" }, { s: "Malik" }]}
        settings={settings}
      />,
    );
    await filter("s", "ALI");
    expect(shown(0)).toEqual(["Alice", "Malik"]);
  });
});

describe("TableRenderer numbers (#2222)", () => {
  it("prints a number with the separator, and a year or id without", () => {
    render(
      <TableRenderer
        data={[{ gross: 40868.59, year: 1999, user_id: 12001, qty: 7 }]}
        settings={settings}
      />,
    );
    expect(shown(0)).toEqual(["40,868.59"]);
    expect(shown(1)).toEqual(["1999"]);
    expect(shown(2)).toEqual(["12001"]);
    expect(shown(3)).toEqual(["7"]);
  });

  it("treats the option defaults (Automatic, -1) as unset", () => {
    render(
      <TableRenderer
        data={[{ gross: 40868.59, year: 1999, qty: 7 }]}
        settings={{ ...settings, numberFormat: "auto", decimalPlaces: -1 }}
      />,
    );
    expect([shown(0), shown(1), shown(2)]).toEqual([
      ["40,868.59"],
      ["1999"],
      ["7"],
    ]);
  });

  it("lets the widget's number format win", () => {
    render(
      <TableRenderer
        data={[{ gross: 40868.59 }]}
        settings={{ ...settings, numberFormat: "plain", decimalPlaces: 1 }}
      />,
    );
    expect(shown(0)).toEqual(["40868.6"]);
  });
});

describe("TableRenderer across a refresh (#2106)", () => {
  it("keeps a header's button and its focus when rows of the same shape arrive", () => {
    const { rerender } = render(
      <TableRenderer data={[{ n: 1 }]} settings={settings} />,
    );
    const button = screen.getByRole("button", { name: "n" });
    button.focus();
    rerender(<TableRenderer data={[{ n: 2 }]} settings={settings} />);
    expect(screen.getByRole("button", { name: "n" })).toBe(button);
    expect(document.activeElement).toBe(button);
  });

  it.each([
    { aggregationFn: "sum", text: "Σ 3" },
    { aggregationFn: "mean", text: "μ 1.5" },
  ])("labels a grouped $aggregationFn as $text", ({ aggregationFn, text }) => {
    render(
      <TableRenderer
        data={[
          { g: "a", n: 1 },
          { g: "a", n: 2 },
        ]}
        settings={{
          ...settings,
          enableGrouping: true,
          groupBy: "g",
          aggregationFn,
        }}
      />,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
  });
});

describe("TableRenderer colour scale (#2105)", () => {
  it.each([
    { values: [10, 50, null, "", "  "], bounds: [10, 50] },
    { values: [-10, 10, null], bounds: [-10, 10] },
  ])("paints only the numeric cells of $values", ({ values, bounds }) => {
    interpolateColor.mockClear();
    render(
      <TableRenderer
        data={values.map((v) => ({ v }))}
        settings={settings}
        colorScales={[{ column: "v", minColor: "#f00", maxColor: "#0f0" }]}
      />,
    );
    const painted = Array.from(
      document.querySelectorAll<HTMLElement>("tbody td"),
    ).map((td) => td.style.backgroundColor !== "");
    expect(painted).toEqual(values.map((v) => typeof v === "number"));
    // The grid renders more than once, so compare the distinct calls.
    expect(new Set(interpolateColor.mock.calls.map(String))).toEqual(
      new Set(
        values
          .filter((v) => typeof v === "number")
          .map((v) => String([v, ...bounds, "#f00", "#0f0"])),
      ),
    );
  });
});
