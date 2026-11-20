import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import ModelPage from "../page";

let mockRole: string | undefined;
let mockState: {
  data?: { id: string; name: string }[];
  isLoading?: boolean;
  isError?: boolean;
};

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    data: mockRole ? { user: { role: mockRole } } : undefined,
  }),
}));
vi.mock("@/hooks/use-connections", () => ({
  useConnections: () => mockState,
}));
vi.mock("@/components/model/connection-terms", () => ({
  ConnectionTerms: (p: { name: string; canEdit: boolean; search: string }) => (
    <p data-testid="terms">{`${p.name}|${p.canEdit}|${p.search}`}</p>
  ),
}));

vi.mock("@/components/model/concepts-section", () => ({
  ConceptsSection: (p: {
    connections: { id: string }[];
    canEdit: boolean;
    search: string;
  }) => (
    <p data-testid="concepts">{`${p.connections.map((c) => c.id)}|${p.canEdit}|${p.search}`}</p>
  ),
}));

describe("ModelPage", () => {
  beforeEach(() => {
    mockRole = "creator";
    mockState = { data: [{ id: "c1", name: "Demo" }] };
  });

  it("shows a loading skeleton while the connections load", () => {
    mockState = { isLoading: true };
    render(<ModelPage />);
    expect(screen.queryByTestId("terms")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says when the connections could not be loaded", () => {
    mockState = { isError: true };
    render(<ModelPage />);
    expect(screen.getByRole("alert").textContent).toContain("Could not load");
  });

  it("invites the first connection when there is none", () => {
    mockState = { data: [] };
    render(<ModelPage />);
    expect(screen.getByText("No connections yet")).toBeTruthy();
  });

  it.each([
    ["creator", "true"],
    ["admin", "true"],
    ["reader", "false"],
  ])("lists a connection's terms, editable for a %s: %s", (role, canEdit) => {
    mockRole = role;
    render(<ModelPage />);
    expect(screen.getByTestId("terms").textContent).toBe(`Demo|${canEdit}|`);
  });

  it("hands the search text to every connection", () => {
    render(<ModelPage />);
    fireEvent.change(screen.getByLabelText("Search terms and concepts"), {
      target: { value: "cust" },
    });
    expect(screen.getByTestId("terms").textContent).toBe("Demo|true|cust");
    expect(screen.getByTestId("concepts").textContent).toBe("c1|true|cust");
  });

  it("leaves the concepts out when there is no connection to map", () => {
    mockState = { data: [] };
    render(<ModelPage />);
    expect(screen.queryByTestId("concepts")).toBeNull();
  });
});
