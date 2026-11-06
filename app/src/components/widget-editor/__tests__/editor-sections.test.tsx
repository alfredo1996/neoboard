import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  CachingSection,
  cacheChoiceOf,
  cacheWritesFor,
} from "../caching-section";
import type { ClickActionRule } from "@/lib/db/schema";
import { InteractionSection } from "../interaction-section";
import { RulesSection } from "../rules-section";
import { WriteModeSection } from "../write-mode-section";
import { AfterSubmitRefresh } from "../after-submit-refresh";

const store = () => useWidgetEditorStore.getState();

const PAGES = [
  { id: "p1", title: "Overview" },
  { id: "p2", title: "Customer" },
];
const RULE: ClickActionRule = {
  id: "r1",
  type: "set-parameter",
  triggerColumn: "id",
  parameterMapping: { parameterName: "order_id", sourceField: "id" },
};

beforeEach(() => {
  useWidgetEditorStore.setState({
    enableCache: true,
    cacheTtlMinutes: 5,
    chartOptions: {},
    dialogStep: "main",
    clickActionEnabled: false,
    actionRules: [],
    stylingEnabled: false,
    stylingRules: [],
    allowWrites: false,
    refreshWidgetIds: [],
  });
});

describe("cache choice (#2388)", () => {
  it.each([
    [true, "ttl", "timed"],
    [false, "ttl", "off"],
    [true, "forever", "forever"],
    // Forever wins: resolve-cache-options reads cacheMode first.
    [false, "forever", "forever"],
    [true, undefined, "timed"],
    [false, undefined, "off"],
  ])("enableCache %s with cacheMode %s reads as %s", (enable, mode, want) => {
    expect(cacheChoiceOf(enable, mode)).toBe(want);
  });

  it.each([
    ["timed", { enableCache: true, cacheMode: "ttl" }],
    ["off", { enableCache: false, cacheMode: "ttl" }],
    ["forever", { cacheMode: "forever" }],
  ] as const)("%s writes the stored values", (choice, want) => {
    expect(cacheWritesFor(choice)).toEqual(want);
  });

  it("writes nothing until a choice is made: a saved Off plus Forever opens as Forever and stays", () => {
    useWidgetEditorStore.setState({
      enableCache: false,
      chartOptions: { cacheMode: "forever" },
    });
    render(<CachingSection />);
    expect(screen.getByRole("radio", { name: "Forever" })).toHaveAttribute(
      "data-state",
      "on",
    );
    expect(store().enableCache).toBe(false);
    expect(store().chartOptions).toEqual({ cacheMode: "forever" });
  });

  it("Timed shows Minutes, and picking Off then Timed round-trips the stored values", () => {
    render(<CachingSection />);
    expect(screen.getByLabelText("Minutes")).toHaveValue(5);

    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(store().enableCache).toBe(false);
    expect(store().chartOptions.cacheMode).toBe("ttl");
    expect(screen.queryByLabelText("Minutes")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Forever" }));
    expect(store().chartOptions.cacheMode).toBe("forever");
    expect(screen.getByTestId("cache-forever-info")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Timed" }));
    expect(store().enableCache).toBe(true);
    expect(store().chartOptions.cacheMode).toBe("ttl");
  });

  it("keeps the timeout at 1 minute or more, and ignores an emptied field (#1292)", () => {
    render(<CachingSection />);
    const minutes = screen.getByLabelText("Minutes");
    fireEvent.change(minutes, { target: { value: "0" } });
    expect(store().cacheTtlMinutes).toBe(1);
    fireEvent.change(minutes, { target: { value: "" } });
    expect(store().cacheTtlMinutes).toBe(1);
  });
});

describe("Interaction, Rules and Write mode rows", () => {
  it("Click action shows no rules until it is on, and has no separate screen", () => {
    render(<InteractionSection clickActionCollisions={[]} pages={PAGES} />);
    expect(screen.queryByRole("button", { name: "Add rule" })).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Click action" }));
    expect(store().clickActionEnabled).toBe(true);
    expect(screen.getByRole("button", { name: "Add rule" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Manage Action Rules" }),
    ).toBeNull();
  });

  it("Add rule adds a group, and delete removes it", () => {
    useWidgetEditorStore.setState({
      clickActionEnabled: true,
      chartType: "table",
      availableFields: ["id", "customer"],
    });
    render(<InteractionSection clickActionCollisions={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Add rule" }));
    expect(screen.getAllByRole("group", { name: /^Rule \d$/ })).toHaveLength(2);
    expect(store().actionRules[0].triggerColumn).toBe("id");
    fireEvent.click(screen.getByRole("button", { name: "Delete rule 1" }));
    expect(screen.getAllByRole("group", { name: /^Rule \d$/ })).toHaveLength(1);
    expect(store().actionRules).toHaveLength(1);
  });

  it("Then switches between the Parameter and Page rows", () => {
    useWidgetEditorStore.setState({
      clickActionEnabled: true,
      chartType: "table",
      availableFields: ["id"],
      actionRules: [RULE],
    });
    render(<InteractionSection clickActionCollisions={[]} pages={PAGES} />);
    expect(screen.getByText("Parameter")).toBeInTheDocument();
    expect(screen.queryByText("Page")).toBeNull();

    fireEvent.click(screen.getByRole("radio", { name: "Open page" }));
    expect(store().actionRules[0].type).toBe("navigate-to-page");
    expect(screen.queryByText("Parameter")).toBeNull();
    expect(screen.getByText("Page")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("radio", { name: "Both" }));
    expect(store().actionRules[0].type).toBe("set-parameter-and-navigate");
    expect(screen.getByText("Parameter")).toBeInTheDocument();
    expect(screen.getByText("Page")).toBeInTheDocument();
  });

  it("the sentence follows the inputs", () => {
    useWidgetEditorStore.setState({
      clickActionEnabled: true,
      chartType: "table",
      availableFields: ["customer"],
      actionRules: [
        {
          ...RULE,
          triggerColumn: "customer",
          type: "set-parameter-and-navigate",
          targetPageId: "p2",
          parameterMapping: { parameterName: "customer", sourceField: "" },
        },
      ],
    });
    render(<InteractionSection clickActionCollisions={[]} pages={PAGES} />);
    expect(
      screen.getByRole("group", { name: "Rule 1" }).querySelector("p"),
    ).toHaveTextContent(
      "Clicking a cell in customer sets $param_customer to its value and opens Customer.",
    );
  });

  it("a table asks for a Column and a chart for the Value from", () => {
    useWidgetEditorStore.setState({
      clickActionEnabled: true,
      chartType: "table",
      availableFields: ["id"],
      actionRules: [RULE],
    });
    const { rerender } = render(
      <InteractionSection clickActionCollisions={[]} pages={PAGES} />,
    );
    expect(screen.getByText("Column")).toBeInTheDocument();
    expect(screen.queryByText("Value from")).toBeNull();

    act(() => useWidgetEditorStore.setState({ chartType: "bar" }));
    rerender(<InteractionSection clickActionCollisions={[]} pages={PAGES} />);
    expect(screen.getByText("Value from")).toBeInTheDocument();
    expect(screen.queryByText("Column")).toBeNull();
  });

  it("names the widgets that set the same parameter", () => {
    useWidgetEditorStore.setState({ clickActionEnabled: true });
    render(
      <InteractionSection
        pages={PAGES}
        clickActionCollisions={[{ widgetId: "w1", title: "Actors" }]}
      />,
    );
    expect(
      screen.getByTestId("click-action-collision-banner"),
    ).toHaveTextContent("also set by: Actors");
  });

  it("rule-based styling opens the styling rules screen", () => {
    render(<RulesSection />);
    fireEvent.click(screen.getByRole("switch", { name: "Rule-based styling" }));
    expect(store().stylingEnabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Styling Rules" }),
    );
    expect(store().dialogStep).toBe("styling-rules");
  });

  it("write mode toggles allowWrites and says the server still checks", () => {
    render(<WriteModeSection />);
    fireEvent.click(screen.getByRole("switch", { name: "Enable write mode" }));
    expect(store().allowWrites).toBe(true);
    expect(screen.getByText(/still requires your account/)).toBeInTheDocument();
  });
});

describe("After submit", () => {
  const others = [
    { id: "a", title: "Actors", chartType: "bar" },
    { id: "b", title: "", chartType: "table" },
  ];

  it("selects and clears every other widget", () => {
    render(<AfterSubmitRefresh otherWidgets={others} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(store().refreshWidgetIds).toEqual(["a", "b"]);
    fireEvent.click(screen.getByRole("button", { name: "Deselect all" }));
    expect(store().refreshWidgetIds).toEqual([]);
  });

  it("says so when there is no other widget", () => {
    render(<AfterSubmitRefresh otherWidgets={[]} />);
    expect(
      screen.getByText("No other widgets on this page."),
    ).toBeInTheDocument();
  });
});
