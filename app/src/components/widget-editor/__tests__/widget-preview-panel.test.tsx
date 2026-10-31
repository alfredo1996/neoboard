import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { Transform } from "@/lib/query/data-transforms";

vi.mock("@neoboard/components", () => ({
  Button: ({
    children,
    onClick,
    disabled,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <button
      onClick={onClick as () => void}
      disabled={disabled as boolean}
      {...props}
    >
      {children}
    </button>
  ),
  Label: ({
    children,
    ...props
  }: React.PropsWithChildren<Record<string, unknown>>) => (
    <label {...props}>{children}</label>
  ),
  WidgetCard: ({
    title,
    children,
  }: React.PropsWithChildren<{ title?: string }>) => (
    <section data-testid="widget-card">
      {title && <h3>{title}</h3>}
      {children}
    </section>
  ),
  LoadingOverlay: ({ text }: { text?: string }) => (
    <div role="status">{text}</div>
  ),
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  MarkdownWidget: ({
    content,
    textSize,
    textAlign,
  }: {
    content?: string;
    textSize?: string;
    textAlign?: string;
  }) => (
    <div data-testid="markdown" data-size={textSize} data-align={textAlign}>
      {content}
    </div>
  ),
  IframeWidget: ({ url }: { url?: string }) => (
    <iframe src={url} title="iframe" />
  ),
}));

vi.mock("../../card-container", () => ({
  CardContainer: ({
    widget,
    previewConnectorType,
  }: {
    widget: { chartType: string };
    previewConnectorType?: string;
  }) => (
    <div
      data-testid="card-container"
      data-chart={widget.chartType}
      data-connector={previewConnectorType}
    >
      card
    </div>
  ),
}));

vi.mock("../parameter-preview", () => ({
  ParameterPreview: ({ isLabMode }: { isLabMode?: boolean }) => (
    <div data-testid="parameter-preview" data-lab-mode={String(isLabMode)}>
      param
    </div>
  ),
}));

import { WidgetPreviewPanel } from "../widget-preview-panel";

function makeProps(
  overrides: Partial<React.ComponentProps<typeof WidgetPreviewPanel>> = {},
) {
  const ref = React.createRef<HTMLDivElement>();
  return {
    chartType: "bar",
    connectionId: "c1",
    query: "SELECT 1",
    title: "My widget",
    chartOptions: {},
    colorScales: [],
    transforms: [] as Transform[],
    transformsEnabled: true,
    buildStylingConfig: () => undefined,
    isParamSelect: false,
    isForm: false,
    isContentOnly: false,
    isMarkdown: false,
    isIframe: false,
    paramUIType: "select" as const,
    dateSub: "single" as const,
    multiSelect: false,
    paramWidgetName: "",
    seedPreviewOptions: null,
    seedQueryPending: false,
    seedQueryError: null,
    formFields: [],
    previewRef: ref,
    previewQuery: {
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
    },
    initialPreviewData: undefined,
    onRunPreview: vi.fn(),
    ...overrides,
  };
}

describe("WidgetPreviewPanel", () => {
  it("names the preview while it loads, with no blur over it (#2224)", () => {
    const { container } = render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: true,
            isError: false,
            error: null,
            data: undefined,
          },
        })}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading preview…");
    expect(container.innerHTML).not.toContain("backdrop-blur");
    // The overlay carries the one spinner.
    expect(
      screen.getByTestId("widget-preview").querySelector(".animate-spin"),
    ).toBeNull();
  });

  // #1374: `flex-shrink-0` here was always inert — the panel's own root is a
  // flex column with no definite height, and the editor lives in a *sibling
  // grid column*, so the preview never competed for the editor's height.
  // Dropping the dead token; `h-[500px]` stays because chart/graph renderers
  // measure their container.
  it("sits in a widget card that reads as the dashboard's will, with the title (#2388)", () => {
    render(<WidgetPreviewPanel {...makeProps({ title: "Top actors" })} />);
    const card = screen.getByTestId("widget-card");
    expect(card).toContainElement(screen.getByTestId("widget-preview"));
    expect(card).toHaveTextContent("Top actors");
    // The old fixed 500px box is gone: the card fills the dialog's height.
    expect(screen.getByTestId("widget-preview").className).not.toContain(
      "h-[500px]",
    );
  });

  it("renders 'Run a query to see the preview' when no connection", () => {
    render(
      <WidgetPreviewPanel {...makeProps({ connectionId: "", query: "" })} />,
    );
    expect(
      screen.getByText(/Run a query to see the preview/),
    ).toBeInTheDocument();
  });

  it("calls onRunPreview when Run button is clicked", () => {
    const onRunPreview = vi.fn();
    render(
      <WidgetPreviewPanel
        {...makeProps({ onRunPreview, query: "SELECT 1", connectionId: "c1" })}
      />,
    );
    fireEvent.click(screen.getByText("Run"));
    expect(onRunPreview).toHaveBeenCalled();
  });

  it("hides Run button for param-select widgets", () => {
    render(<WidgetPreviewPanel {...makeProps({ isParamSelect: true })} />);
    expect(screen.queryByText("Run")).not.toBeInTheDocument();
  });

  it("keeps the Run button grouped with the error icon so it doesn't shift on error", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: false,
            isError: true,
            error: new Error("boom"),
            data: undefined,
          },
        })}
      />,
    );
    const runButton = screen.getByText("Run").closest("button")!;
    const errorButton = screen.getByLabelText(/Query failed: boom/);
    // Both live in the same action group (not as separate justify-between
    // children), so adding the error icon can't push the Run button inward.
    expect(runButton.parentElement).toBe(errorButton.parentElement);
  });

  it("shows a waiting state instead of running an unbound-param query (#1055)", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          query: "SELECT * FROM t WHERE s = $param_status",
          waitingForParams: true,
        })}
      />,
    );
    expect(screen.getByTestId("preview-waiting-params")).toHaveTextContent(
      /Waiting for parameters/i,
    );
    // The chart preview (card container) must not render while waiting.
    expect(screen.queryByTestId("card-container")).not.toBeInTheDocument();
  });

  it("renders MarkdownWidget when isMarkdown", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          isMarkdown: true,
          chartOptions: { content: "# Hello" },
        })}
      />,
    );
    expect(screen.getByTestId("markdown")).toHaveTextContent("# Hello");
  });

  it("previews a markdown widget's text size and alignment, and ignores bad values (#2392)", () => {
    const { rerender } = render(
      <WidgetPreviewPanel
        {...makeProps({
          isMarkdown: true,
          chartOptions: { content: "x", textSize: "lg", textAlign: "right" },
        })}
      />,
    );
    const el = screen.getByTestId("markdown");
    expect(el).toHaveAttribute("data-size", "lg");
    expect(el).toHaveAttribute("data-align", "right");
    rerender(
      <WidgetPreviewPanel
        {...makeProps({
          isMarkdown: true,
          chartOptions: { content: "x", textSize: 5 },
        })}
      />,
    );
    expect(screen.getByTestId("markdown")).not.toHaveAttribute("data-size");
  });

  // In the Widget Library the preview must not bind a parent value the last
  // dashboard left in the store, as the Test Seed Query button does not (#1951).
  it("tells ParameterPreview it is in the Widget Library", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({ isParamSelect: true, isLabMode: true })}
      />,
    );
    expect(
      screen.getByTestId("parameter-preview").getAttribute("data-lab-mode"),
    ).toBe("true");
  });

  it("renders ParameterPreview when isParamSelect", () => {
    render(<WidgetPreviewPanel {...makeProps({ isParamSelect: true })} />);
    expect(screen.getByTestId("parameter-preview")).toBeInTheDocument();
  });

  it("renders CardContainer when preview data is available", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: false,
            isError: false,
            error: null,
            data: { data: [{ n: 1 }], resultId: "r1" },
          },
        })}
      />,
    );
    expect(screen.getByTestId("card-container")).toBeInTheDocument();
  });

  // #2061: a graph preview finds its Expand query from the connector the
  // preview's result names.
  it("hands the card the connector that ran the preview", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: false,
            isError: false,
            error: null,
            data: { data: [], resultId: "r1", connectorType: "fixturedb" },
          },
        })}
      />,
    );
    expect(screen.getByTestId("card-container")).toHaveAttribute(
      "data-connector",
      "fixturedb",
    );
  });

  it("renders a truncated result as a normal preview: the 25-row cap is the point, not a warning (#1896)", () => {
    // What the query hook hands back when the driver stopped at the cap.
    const truncatedResult = {
      data: Array.from({ length: 25 }, (_, n) => ({ n })),
      resultId: "r1",
      truncated: true,
      rowLimit: 25,
    };
    render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: false,
            isError: false,
            error: null,
            data: truncatedResult,
          },
        })}
      />,
    );

    expect(screen.getByTestId("card-container")).toBeInTheDocument();
    expect(screen.getByText("Preview shows up to 25 rows")).toBeInTheDocument();
    expect(screen.queryByText(/truncated|Showing first/i)).toBeNull();
    expect(screen.queryByText("Query failed")).toBeNull();
  });

  it("shows error state when preview query fails and no data", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: false,
            isError: true,
            error: new Error("Boom"),
            data: undefined,
          },
        })}
      />,
    );
    // "Query failed" appears in both the error tooltip and main area
    expect(screen.getAllByText(/Query failed/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Boom").length).toBeGreaterThan(0);
  });

  // #1903: the connector flags a blocked write, the API passes the flag on as
  // `details`, and the panel never reads the driver's words.
  it("says writes are not allowed when the connector flagged a blocked write", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          previewQuery: {
            isPending: false,
            isError: true,
            error: Object.assign(new Error("the driver's own words"), {
              details: { blockedWrite: true },
            }),
            data: undefined,
          },
        })}
      />,
    );
    expect(screen.getByText("Writes not allowed")).toBeTruthy();
    expect(screen.getByText(/use a Form widget/)).toBeTruthy();
  });

  it("shows form field list for form widgets with fields", () => {
    render(
      <WidgetPreviewPanel
        {...makeProps({
          isForm: true,
          formFields: [
            {
              id: "f1",
              parameterName: "name",
              parameterType: "text",
              label: "Name",
              required: true,
            },
          ] as React.ComponentProps<typeof WidgetPreviewPanel>["formFields"],
        })}
      />,
    );
    expect(screen.getByText("Name")).toBeInTheDocument();
  });

  it("shows empty form hint when form has no fields", () => {
    render(
      <WidgetPreviewPanel {...makeProps({ isForm: true, formFields: [] })} />,
    );
    expect(
      screen.getByText(/Add fields in the Fields section/),
    ).toBeInTheDocument();
  });
});
