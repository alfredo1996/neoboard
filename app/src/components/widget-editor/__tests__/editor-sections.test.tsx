import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useWidgetEditorStore } from "@/stores/widget-editor-store";
import {
  CachingSection,
  cacheChoiceOf,
  cacheWritesFor,
} from "../caching-section";
import { InteractionSection } from "../interaction-section";
import { RulesSection } from "../rules-section";
import { WriteModeSection } from "../write-mode-section";
import { AfterSubmitRefresh } from "../after-submit-refresh";

const store = () => useWidgetEditorStore.getState();

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
  it("click action opens the rules screen from its own row", () => {
    render(<InteractionSection clickActionCollisions={[]} />);
    expect(
      screen.queryByRole("button", { name: "Manage Action Rules" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("switch", { name: "Click action" }));
    expect(store().clickActionEnabled).toBe(true);
    fireEvent.click(
      screen.getByRole("button", { name: "Manage Action Rules" }),
    );
    expect(store().dialogStep).toBe("rules");
  });

  it("names the widgets that set the same parameter", () => {
    useWidgetEditorStore.setState({ clickActionEnabled: true });
    render(
      <InteractionSection
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
