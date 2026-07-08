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
  Tooltip: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
  TooltipContent: ({ children }: React.PropsWithChildren) => (
    <div>{children}</div>
  ),
  MarkdownWidget: ({ content }: { content?: string }) => (
    <div data-testid="markdown">{content}</div>
  ),
  IframeWidget: ({ url }: { url?: string }) => (
    <iframe src={url} title="iframe" />
  ),
}));

vi.mock("../../card-container", () => ({
  CardContainer: ({ widget }: { widget: { chartType: string } }) => (
    <div data-testid="card-container" data-chart={widget.chartType}>
      card
    </div>
  ),
}));

vi.mock("../parameter-preview", () => ({
  ParameterPreview: () => <div data-testid="parameter-preview">param</div>,
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
