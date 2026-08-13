import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { SaveTemplateDialog } from "../save-template-dialog";
import type { DashboardWidget } from "@/lib/db/schema";

const mutateAsync = vi.fn();
vi.mock("@/hooks/use-widget-templates", () => ({
  useCreateWidgetTemplate: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/lib/plugin/chart-helpers", () => ({
  getChartConfig: (t: string) => (t === "bar" ? { label: "Bar Chart" } : null),
}));

const widget = {
  id: "w1",
  chartType: "bar",
  query: "SELECT 1",
  params: {},
  connectionId: "conn-1",
  settings: { title: "Revenue", connectionId: "conn-1" },
} as unknown as DashboardWidget;

function renderDialog(
  over: Partial<React.ComponentProps<typeof SaveTemplateDialog>> = {},
) {
  const onOpenChange = vi.fn();
  const onSaved = vi.fn();
  render(
    <SaveTemplateDialog
      open
      onOpenChange={onOpenChange}
      widget={widget}
      connectorType={"postgres" as never}
      onSaved={onSaved}
      {...over}
    />,
  );
  return { onOpenChange, onSaved };
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({});
});

describe("SaveTemplateDialog", () => {
  it("describes the dialog for assistive tech (#1282)", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    // The non-obvious consequence of saving a template.
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /the connection is not/i,
    );
  });

  it("seeds the name from the widget's title", () => {
    renderDialog();
    expect(screen.getByLabelText(/name/i)).toHaveValue("Revenue");
  });

  it("falls back to the chart label when the widget has no title", () => {
    render(
      <SaveTemplateDialog
        open
        onOpenChange={vi.fn()}
        widget={{ ...widget, settings: {} } as unknown as DashboardWidget}
        connectorType={"postgres" as never}
      />,
    );
    expect(screen.getByLabelText(/name/i)).toHaveValue("Bar Chart");
  });

  it("saves the query and settings but strips the connection", async () => {
    const user = userEvent.setup();
    const { onSaved } = renderDialog();

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(mutateAsync).toHaveBeenCalledTimes(1);
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.query).toBe("SELECT 1");
    // The description promises this — assert it rather than trusting the copy.
    expect(payload.settings.connectionId).toBeUndefined();
    expect(onSaved).toHaveBeenCalled();
  });

  it("splits comma-separated tags and drops blanks", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.type(screen.getByLabelText(/tags/i), "sales, , ops ,");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(mutateAsync.mock.calls[0][0].tags).toEqual(["sales", "ops"]);
  });

  it("omits description and tags when left empty", async () => {
    const user = userEvent.setup();
    renderDialog();

    await user.click(screen.getByRole("button", { name: /save/i }));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload.description).toBeUndefined();
    expect(payload.tags).toBeUndefined();
  });

  it("surfaces a save failure instead of closing", async () => {
    const user = userEvent.setup();
    mutateAsync.mockRejectedValue(new Error("Template name taken"));
    const { onOpenChange, onSaved } = renderDialog();

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(await screen.findByText("Template name taken")).toBeInTheDocument();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
