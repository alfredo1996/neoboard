import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

/* ---------- mocks ---------- */

let pathname = "/d1";

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "d1" }),
  usePathname: () => pathname,
}));

vi.mock("@/components/dashboard-workspace", () => ({
  DashboardWorkspace: ({
    id,
    editMode,
    children,
  }: {
    id: string;
    editMode: boolean;
    children?: React.ReactNode;
  }) => (
    <div data-testid="workspace" data-id={id} data-edit={String(editMode)}>
      {children}
    </div>
  ),
}));

/* ---------- import under test ---------- */

import DashboardIdLayout from "../layout";

/* ---------- tests ---------- */

describe("DashboardIdLayout", () => {
  beforeEach(() => {
    pathname = "/d1";
  });

  it("passes the dashboard id from the route params", () => {
    render(<DashboardIdLayout>{null}</DashboardIdLayout>);
    expect(screen.getByTestId("workspace")).toHaveAttribute("data-id", "d1");
  });

  it("reads view mode off the /[id] path", () => {
    render(<DashboardIdLayout>{null}</DashboardIdLayout>);
    expect(screen.getByTestId("workspace")).toHaveAttribute(
      "data-edit",
      "false",
    );
  });

  it("reads edit mode off the /[id]/edit path", () => {
    pathname = "/d1/edit";
    render(<DashboardIdLayout>{null}</DashboardIdLayout>);
    expect(screen.getByTestId("workspace")).toHaveAttribute(
      "data-edit",
      "true",
    );
  });

  it("renders the page slot", () => {
    render(
      <DashboardIdLayout>
        <div>page slot</div>
      </DashboardIdLayout>,
    );
    expect(screen.getByText("page slot")).toBeInTheDocument();
  });
});
