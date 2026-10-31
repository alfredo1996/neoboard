import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { OptionRows } from "./option-rows";
import { OPTION_GROUPS, getChartOptions } from "../chart-options-schema";
import { CHART_TYPES_WITH_OPTIONS } from "../chart-options/index";

// This panel renders every option for a chart type (+ category expansion), a
// heavy jsdom render that intermittently exceeds the 5s default under parallel
// CI load — the source of a flaky timeout. Give the whole file headroom.
vi.setConfig({ testTimeout: 15000 });

// cmdk calls scrollIntoView which jsdom doesn't implement
beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

describe("OptionRows", () => {
  it("renders options for bar chart", () => {
    render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );
    expect(screen.getByText("Orientation")).toBeInTheDocument();
    expect(screen.getByText("Stacking")).toBeInTheDocument();
    expect(screen.getByText("Show values")).toBeInTheDocument();
    expect(screen.getByText("Show legend")).toBeInTheDocument();
    expect(screen.getByText("Bar width")).toBeInTheDocument();
    expect(screen.getByText("Grid lines")).toBeInTheDocument();
  });

  it("calls onSettingsChange when a boolean switch is toggled", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="bar"
        settings={{ showValues: false }}
        onSettingsChange={onChange}
      />,
    );
    const switchEl = screen.getByRole("switch", { name: "Show values" });
    fireEvent.click(switchEl);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ showValues: true }),
    );
  });

  it("calls onSettingsChange when a text input changes", () => {
    const onChange = vi.fn();
    render(
      <OptionRows chartType="line" settings={{}} onSettingsChange={onChange} />,
    );
    const input = screen.getByLabelText("X axis label");
    fireEvent.change(input, { target: { value: "Time" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ xAxisLabel: "Time" }),
    );
  });

  it("calls onSettingsChange when a number input changes", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="table"
        settings={{}}
        onSettingsChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Page size");
    fireEvent.change(input, { target: { value: "50" } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ pageSize: 50 }),
    );
  });

  it("ignores a cleared number input instead of committing 0 (#1292)", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="table"
        settings={{}}
        onSettingsChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Page size"), {
      target: { value: "" },
    });
    // Number("") is 0, so clearing the field used to commit pageSize: 0 —
    // a value the user never typed, and one they could not undo by blanking.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("leaves a number alone when it is emptied and has no automatic value or placeholder (#1292)", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="line"
        settings={{ lineWidth: 3 }}
        onSettingsChange={onChange}
      />,
    );
    fireEvent.change(screen.getByLabelText("Line width"), {
      target: { value: "" },
    });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows Page Size with the Auto placeholder, and clearing a typed value saves it unset (#2356)", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="table"
        settings={{ pageSize: 5 }}
        onSettingsChange={onChange}
      />,
    );
    const input = screen.getByLabelText("Page size");
    expect(input).toHaveAttribute("placeholder", "Auto");
    fireEvent.change(input, { target: { value: "" } });
    const saved = onChange.mock.calls[0][0];
    expect("pageSize" in saved).toBe(false);
  });

  it("renders Page Size empty when no page size is saved (#2356)", () => {
    render(
      <OptionRows chartType="table" settings={{}} onSettingsChange={vi.fn()} />,
    );
    expect(screen.getByLabelText("Page size")).toHaveValue(null);
  });

  it("leaves the panel's labels unmarked: the chart-options panel is exempt from (optional) (#2217)", () => {
    render(
      <OptionRows
        chartType="markdown"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Markdown content")).toBeInTheDocument();
    expect(screen.queryByText(/\(optional\)/)).not.toBeInTheDocument();
  });

  it("renders a group's rows under its heading, groups in the fixed order for every chart (#2388)", () => {
    const order = Object.keys(OPTION_GROUPS);
    for (const type of CHART_TYPES_WITH_OPTIONS) {
      const { unmount } = render(
        <OptionRows
          chartType={type}
          settings={{}}
          onSettingsChange={vi.fn()}
        />,
      );
      const headings = screen
        .queryAllByRole("heading", { level: 3 })
        .map((h) => h.textContent ?? "");
      expect(headings, type).toEqual(
        [...headings].sort((x, y) => order.indexOf(x) - order.indexOf(y)),
      );
      // No heading without a row under it.
      for (const h of screen.queryAllByRole("heading", { level: 3 })) {
        expect(
          h.parentElement!.children.length,
          `${type} ${h.textContent}`,
        ).toBeGreaterThan(1);
      }
      unmount();
    }
    render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );
    expect(
      screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent),
    ).toEqual([
      "Bars",
      "Axes",
      "Legend",
      "Data labels",
      "Color",
      "Reference lines",
      "Refresh",
      "Caching",
      "Interaction",
    ]);
  });

  it("renders text inputs for the map tile layer and attribution (#1685)", () => {
    render(
      <OptionRows chartType="map" settings={{}} onSettingsChange={vi.fn()} />,
    );
    // A three-entry select could not take a self-hosted template.
    const tile = screen.getByLabelText("Tile layer");
    expect(tile.tagName).toBe("INPUT");
    expect(tile).toHaveValue(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    );
    expect(screen.getByLabelText("Attribution").tagName).toBe("INPUT");
  });

  it("flags a tile template with a placeholder Leaflet cannot fill (#1685)", () => {
    // Thunderforest's documented template, pasted verbatim. Leaflet would
    // throw from inside addTo(map); the chart now draws no tiles and the
    // panel says why, inline, before the creator saves it.
    render(
      <OptionRows
        chartType="map"
        settings={{
          tileLayer:
            "https://tile.thunderforest.com/cycle/{z}/{x}/{y}.png?apikey={apikey}",
        }}
        onSettingsChange={vi.fn()}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("{apikey}");
    expect(screen.getByLabelText("Tile layer")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("shows no message for the default tile template", () => {
    render(
      <OptionRows chartType="map" settings={{}} onSettingsChange={vi.fn()} />,
    );
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders only placeholder and searchable for parameter-select", () => {
    render(
      <OptionRows
        chartType="parameter-select"
        settings={{}}
        onSettingsChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Placeholder")).toBeInTheDocument();
    expect(screen.getByText("Search-as-you-type")).toBeInTheDocument();
    // Should NOT show the old primary fields
    expect(screen.queryByText("Parameter Name")).not.toBeInTheDocument();
    expect(screen.queryByText("Selector Type")).not.toBeInTheDocument();
  });

  it("keeps each described option's description for screen readers (#1283)", () => {
    // Was: labels carried `cursor-help` + a dotted underline and the
    // description lived in a hover tooltip. A Label is not focusable, so that
    // content was pointer-only. It is now real text, linked by
    // aria-describedby — see chart-options-describedby.test.tsx.
    render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );
    const described = getChartOptions("bar").filter((o) => o.description);
    expect(described.length).toBeGreaterThan(0);
    for (const option of described) {
      // A switch keeps its own -desc paragraph; every other control gets the
      // Field's -help text (#2217).
      const text =
        document.getElementById(`${option.key}-desc`) ??
        document.getElementById(`${option.key}-help`);
      expect(text).toHaveTextContent(option.description!);
    }
  });

  it("does not render a HelpCircle icon — tooltip triggers on label text", () => {
    // The HelpCircle icon was removed; only the label itself triggers the tooltip
    const { container } = render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );
    // There should be no svg element with the lucide HelpCircle path inside the panel
    // Only Switch thumbs and other UI icons, no HelpCircle — check no icon has cursor-help
    const helpIcons = container.querySelectorAll("svg.cursor-help");
    expect(helpIcons.length).toBe(0);
  });

  it("no longer gates descriptions behind a hover affordance (#1283)", () => {
    const { container } = render(
      <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
    );
    // The dotted underline advertised content the keyboard could never open.
    expect(container.querySelectorAll("label.cursor-help")).toHaveLength(0);
    expect(container.querySelectorAll("label.decoration-dotted")).toHaveLength(
      0,
    );
  });

  it("renders MultiSelect for column-multi-select type when columns are provided", () => {
    render(
      <OptionRows
        chartType="table"
        settings={{ enableGrouping: true }}
        onSettingsChange={vi.fn()}
        columns={["country", "city", "population"]}
      />,
    );
    // MultiSelect renders a combobox trigger with placeholder text
    expect(screen.getByText("Select columns…")).toBeInTheDocument();
  });

  it("pre-selects a column-multi-select from an existing comma-separated value", () => {
    // Exercises the csv-truthy branch (split/trim/filter) — only reached when
    // the option already has a value, which the empty-state tests don't cover.
    render(
      <OptionRows
        chartType="table"
        settings={{ enableGrouping: true, groupBy: "country, city" }}
        onSettingsChange={vi.fn()}
        columns={["country", "city", "population"]}
      />,
    );
    // The two saved columns render as selected chips inside the MultiSelect.
    expect(screen.getByText("country")).toBeInTheDocument();
    expect(screen.getByText("city")).toBeInTheDocument();
  });

  it("renders text fallback for column-multi-select when no columns are provided", () => {
    render(
      <OptionRows
        chartType="table"
        settings={{ enableGrouping: true }}
        onSettingsChange={vi.fn()}
      />,
    );
    // Falls back to a text input when columns are not available
    const input = screen.getByPlaceholderText(
      "Run a preview query to select columns",
    );
    expect(input).toBeInTheDocument();
    expect(input.tagName).toBe("INPUT");
  });

  it("calls onSettingsChange with comma-separated string when multi-select changes", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="table"
        settings={{ enableGrouping: true, groupBy: "" }}
        onSettingsChange={onChange}
        columns={["country", "city", "population"]}
      />,
    );
    // MultiSelect trigger shows placeholder when nothing selected
    const trigger = screen.getByText("Select columns…").closest("button")!;
    fireEvent.click(trigger);
    // Select "city"
    // #1284: multi-select options now carry their checked state in the
    // accessible name ("city, not selected"), so this can no longer be an
    // exact match.
    const cityOption = screen.getByRole("option", { name: /^city\b/ });
    fireEvent.click(cityOption);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ groupBy: "city" }),
    );
  });

  // The markdown widget's content is multiline by nature — its option must
  // render a textarea that preserves newlines, not a single-line input (#1049).
  it("renders a multiline textarea for the markdown content option", () => {
    const onChange = vi.fn();
    render(
      <OptionRows
        chartType="markdown"
        settings={{}}
        onSettingsChange={onChange}
      />,
    );
    // The markdown panel's single category starts expanded — only expand
    // collapsed sections if any exist.
    screen
      .queryAllByRole("button", { expanded: false })
      .forEach((btn) => fireEvent.click(btn));
    const field = screen.getByLabelText("Markdown content");
    expect(field.tagName).toBe("TEXTAREA");

    const multiline = "# Heading\n- item one\n- item two";
    fireEvent.change(field, { target: { value: multiline } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ content: multiline }),
    );
  });

  describe("swatch options (#2368)", () => {
    const renderFilter = (
      settings: Record<string, unknown>,
      onSettingsChange = vi.fn(),
      extra: Record<string, unknown> = {},
    ) =>
      render(
        <OptionRows
          chartType="parameter-select"
          settings={settings}
          onSettingsChange={onSettingsChange}
          {...extra}
        />,
      );

    it("shows the Field group first, with a radiogroup of named swatches", () => {
      renderFilter({});
      const group = screen.getByRole("radiogroup", { name: "Field fill" });
      const names = within(group)
        .getAllByRole("radio")
        .map((r) => r.getAttribute("aria-label"));
      expect(names).toEqual(["Default", "Azure", "Citrine", "Sage", "Rose"]);
      expect(
        within(screen.getByRole("radiogroup", { name: "Field border" }))
          .getAllByRole("radio")
          .map((r) => r.getAttribute("aria-label")),
      ).toEqual(["Default", "Azure", "Citrine", "Sage", "Ink"]);
      expect(screen.getAllByRole("heading", { level: 3 })[0]).toHaveTextContent(
        "Field",
      );
    });

    it("marks the stored value checked, Default when nothing is stored", () => {
      renderFilter({ fieldBorder: "citrine" });
      const border = screen.getByRole("radiogroup", { name: "Field border" });
      expect(
        within(border).getByRole("radio", { name: "Citrine" }),
      ).toHaveAttribute("aria-checked", "true");
      expect(
        within(border).getByRole("radio", { name: "Default" }),
      ).toHaveAttribute("aria-checked", "false");
      const fill = screen.getByRole("radiogroup", { name: "Field fill" });
      expect(
        within(fill).getByRole("radio", { name: "Default" }),
      ).toHaveAttribute("aria-checked", "true");
    });

    it("clicking a swatch reports its value", () => {
      const onChange = vi.fn();
      renderFilter({ parameterName: "p" }, onChange);
      fireEvent.click(
        within(
          screen.getByRole("radiogroup", { name: "Field fill" }),
        ).getByRole("radio", { name: "Azure" }),
      );
      expect(onChange).toHaveBeenCalledWith({
        parameterName: "p",
        fieldFill: "azure",
      });
    });

    it("arrow keys move the selection and focus, and wrap; only the checked swatch is tabbable", () => {
      const onChange = vi.fn();
      renderFilter({ fieldFill: "azure" }, onChange);
      const fill = screen.getByRole("radiogroup", { name: "Field fill" });
      const radios = within(fill).getAllByRole("radio");
      expect(radios.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
      fireEvent.keyDown(radios[1], { key: "ArrowRight" });
      expect(onChange).toHaveBeenLastCalledWith({ fieldFill: "citrine" });
      expect(radios[2]).toHaveFocus();
      fireEvent.keyDown(radios[0], { key: "ArrowLeft" });
      expect(onChange).toHaveBeenLastCalledWith({ fieldFill: "rose" });
      expect(radios[4]).toHaveFocus();
      fireEvent.keyDown(radios[4], { key: "ArrowDown" });
      expect(onChange).toHaveBeenLastCalledWith({ fieldFill: "default" });
      expect(radios[0]).toHaveFocus();
    });

    it("a stored value that is not a preset reads as Default, and stays reachable by keyboard", () => {
      renderFilter({ fieldFill: "#ff0000" });
      const radios = within(
        screen.getByRole("radiogroup", { name: "Field fill" }),
      ).getAllByRole("radio");
      expect(radios[0]).toHaveAttribute("aria-checked", "true");
      expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    });

    it("the checked swatch carries a check mark, the others none", () => {
      renderFilter({ fieldFill: "sage" });
      const radios = within(
        screen.getByRole("radiogroup", { name: "Field fill" }),
      ).getAllByRole("radio");
      expect(radios.map((r) => r.querySelector("svg") !== null)).toEqual([
        false,
        false,
        false,
        true,
        false,
      ]);
    });

    it("shows a filter's Field and Input groups together, none collapsed", () => {
      renderFilter({});
      expect(screen.getByLabelText("Placeholder")).toBeInTheDocument();
      expect(screen.getByText("Sync to URL")).toBeInTheDocument();
      expect(
        screen.getByRole("radiogroup", { name: "Field fill" }),
      ).toBeInTheDocument();
    });

    it("hiddenCategories leaves a category out", () => {
      renderFilter({}, vi.fn(), { hiddenCategories: ["Field"] });
      expect(screen.queryByText("Field")).not.toBeInTheDocument();
      expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    });
  });

  describe("rows sized to their values (#2388)", () => {
    const rotation = () => screen.getByLabelText("Label rotation");

    it.each([
      ["axisLabelRotation", "Label rotation", -1],
      ["barWidth", "Bar width", 0],
    ])(
      "shows a stored %s of %s as an empty Auto field and leaves it when saved untouched",
      (key, label, auto) => {
        const onChange = vi.fn();
        render(
          <OptionRows
            chartType="bar"
            settings={{ [key]: auto }}
            onSettingsChange={onChange}
          />,
        );
        const input = screen.getByLabelText(label);
        expect(input).toHaveValue(null);
        expect(input).toHaveAttribute("placeholder", "Auto");
        expect(onChange).not.toHaveBeenCalled();
      },
    );

    it("stores a typed value as a number, and an emptied field as the automatic value", () => {
      const onChange = vi.fn();
      render(
        <OptionRows
          chartType="bar"
          settings={{ axisLabelRotation: 45 }}
          onSettingsChange={onChange}
        />,
      );
      fireEvent.change(rotation(), { target: { value: "30" } });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ axisLabelRotation: 30 }),
      );
      fireEvent.change(rotation(), { target: { value: "" } });
      expect(onChange).toHaveBeenLastCalledWith(
        expect.objectContaining({ axisLabelRotation: -1 }),
      );
    });

    it("draws a two- or three-way choice as a segmented control storing the old values", () => {
      const onChange = vi.fn();
      render(
        <OptionRows
          chartType="bar"
          settings={{}}
          onSettingsChange={onChange}
        />,
      );
      expect(screen.getAllByRole("radio", { name: "Vertical" })).toHaveLength(
        1,
      );
      fireEvent.click(screen.getByRole("radio", { name: "Horizontal" }));
      expect(onChange).toHaveBeenLastCalledWith({ orientation: "horizontal" });
      fireEvent.click(screen.getByRole("radio", { name: "Stacked" }));
      expect(onChange).toHaveBeenLastCalledWith({ stackMode: "stacked" });
      fireEvent.click(screen.getByRole("radio", { name: "100%" }));
      expect(onChange).toHaveBeenLastCalledWith({ stackMode: "percent" });
    });

    it("keeps a longer list as a dropdown", () => {
      render(
        <OptionRows chartType="bar" settings={{}} onSettingsChange={vi.fn()} />,
      );
      expect(
        screen.getByRole("combobox", { name: "Palette" }),
      ).toBeInTheDocument();
    });
  });
});
