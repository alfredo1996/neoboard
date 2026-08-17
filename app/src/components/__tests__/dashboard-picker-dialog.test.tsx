import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DashboardPickerDialog } from "../dashboard-picker-dialog";

const mockUseDashboards = vi.fn();
vi.mock("@/hooks/use-dashboards", () => ({
  useDashboards: () => mockUseDashboards(),
}));

type Row = { id: string; name: string; role: string };

function setDashboards(data: Row[] | undefined, isLoading = false) {
  mockUseDashboards.mockReturnValue({ data, isLoading });
}

const props = {
  open: true,
  onOpenChange: vi.fn(),
  onSelect: vi.fn(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("DashboardPickerDialog", () => {
  it("shows a loading message while dashboards are fetching", () => {
    setDashboards(undefined, true);
    render(<DashboardPickerDialog {...props} />);
    expect(screen.getByText(/loading dashboards/i)).toBeInTheDocument();
  });

  it("describes the dialog for assistive tech (#1282)", () => {
    setDashboards([{ id: "1", name: "Ops", role: "owner" }]);
    render(<DashboardPickerDialog {...props} />);

    const dialog = screen.getByRole("dialog");
    const describedBy = dialog.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      /select which dashboard/i,
    );
  });

  it("lists only dashboards the user can edit", () => {
    setDashboards([
      { id: "1", name: "Owned", role: "owner" },
      { id: "2", name: "Editable", role: "editor" },
      { id: "3", name: "Admined", role: "admin" },
      { id: "4", name: "ReadOnly", role: "viewer" },
    ]);
    render(<DashboardPickerDialog {...props} />);

    expect(screen.getByText("Owned")).toBeInTheDocument();
    expect(screen.getByText("Editable")).toBeInTheDocument();
    expect(screen.getByText("Admined")).toBeInTheDocument();
    expect(screen.queryByText("ReadOnly")).not.toBeInTheDocument();
  });

  it("shows the empty state when nothing is editable", () => {
    setDashboards([{ id: "4", name: "ReadOnly", role: "viewer" }]);
    render(<DashboardPickerDialog {...props} />);
    expect(screen.getByText(/no editable dashboards/i)).toBeInTheDocument();
  });

  it("hides the search box until there are more than three dashboards", () => {
    setDashboards([
      { id: "1", name: "A", role: "owner" },
      { id: "2", name: "B", role: "owner" },
      { id: "3", name: "C", role: "owner" },
    ]);
    const { unmount } = render(<DashboardPickerDialog {...props} />);
    expect(
      screen.queryByPlaceholderText(/search dashboards/i),
    ).not.toBeInTheDocument();
    unmount();

    setDashboards([
      { id: "1", name: "A", role: "owner" },
      { id: "2", name: "B", role: "owner" },
      { id: "3", name: "C", role: "owner" },
      { id: "4", name: "D", role: "owner" },
    ]);
    render(<DashboardPickerDialog {...props} />);
    expect(
      screen.getByPlaceholderText(/search dashboards/i),
    ).toBeInTheDocument();
  });

  it("filters by name and reports when nothing matches", async () => {
    const user = userEvent.setup();
    setDashboards([
      { id: "1", name: "Revenue", role: "owner" },
      { id: "2", name: "Traffic", role: "owner" },
      { id: "3", name: "Latency", role: "owner" },
      { id: "4", name: "Errors", role: "owner" },
    ]);
    render(<DashboardPickerDialog {...props} />);

    const search = screen.getByPlaceholderText(/search dashboards/i);
    await user.type(search, "rev");
    expect(screen.getByText("Revenue")).toBeInTheDocument();
    expect(screen.queryByText("Traffic")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText(/no dashboards match/i)).toBeInTheDocument();
  });

  it("selects a dashboard and closes", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    setDashboards([{ id: "42", name: "Ops", role: "owner" }]);
    render(
      <DashboardPickerDialog
        open
        onSelect={onSelect}
        onOpenChange={onOpenChange}
      />,
    );

    await user.click(screen.getByText("Ops"));
    expect(onSelect).toHaveBeenCalledWith("42");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
