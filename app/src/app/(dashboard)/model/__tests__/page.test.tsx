import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  ConnectionTerms: (p: {
    name: string;
    canEdit: boolean;
    search: string;
    defaultOpen?: boolean;
    forceOpen?: boolean;
  }) => (
    <p
      data-testid="terms"
      data-open={String(!!p.defaultOpen)}
      data-force={String(!!p.forceOpen)}
    >{`${p.name}|${p.canEdit}|${p.search}`}</p>
  ),
}));

vi.mock("@/components/model/concepts-section", () => ({
  ConceptsSection: (p: {
    connections: { id: string }[];
    canEdit: boolean;
    search: string;
    newOpen: boolean;
  }) => (
    <p data-testid="concepts">{`${p.connections.map((c) => c.id)}|${p.canEdit}|${p.search}|${p.newOpen}`}</p>
  ),
}));

vi.mock("@/components/model/import-dialog", () => ({
  ImportDialog: (p: { open: boolean }) =>
    p.open ? <p data-testid="import-dialog">open</p> : null,
}));
const mockToast = vi.fn();
vi.mock("@neoboard/components", async (orig) => ({
  ...(await orig<typeof import("@neoboard/components")>()),
  useToast: () => ({ toast: mockToast }),
}));
const mockDownload = vi.fn(() => Promise.resolve());
vi.mock("@/lib/ontology/download-model", () => ({
  downloadModel: () => mockDownload(),
}));

describe("ModelPage", () => {
  beforeEach(() => {
    mockRole = "creator";
    mockDownload.mockClear();
    mockToast.mockClear();
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
    expect(screen.getByTestId("concepts").textContent).toBe(
      "c1|true|cust|false",
    );
  });

  it("puts New concept in the header, for a creator and an admin only", () => {
    render(<ModelPage />);
    const header = screen.getByRole("banner");
    fireEvent.click(
      within(header).getByRole("button", { name: "New concept" }),
    );
    expect(screen.getByTestId("concepts").textContent).toBe("c1|true||true");
    cleanup();
    mockRole = "reader";
    render(<ModelPage />);
    expect(screen.queryByRole("button", { name: "New concept" })).toBeNull();
  });

  it("leaves the concepts out when there is no connection to map", () => {
    mockState = { data: [] };
    render(<ModelPage />);
    expect(screen.queryByTestId("concepts")).toBeNull();
  });

  it("offers Export to everyone and Import to creators and admins only", () => {
    render(<ModelPage />);
    const header = screen.getByRole("banner");
    expect(within(header).getByRole("button", { name: "Export" })).toBeTruthy();
    fireEvent.click(within(header).getByRole("button", { name: "Import" }));
    expect(screen.getByTestId("import-dialog")).toBeTruthy();
    cleanup();
    mockRole = "reader";
    render(<ModelPage />);
    expect(screen.getByRole("button", { name: "Export" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Import" })).toBeNull();
  });

  it("opens a single connection by itself, and leaves several closed (#2533)", () => {
    const { unmount } = render(<ModelPage />);
    expect(screen.getByTestId("terms").dataset.open).toBe("true");
    unmount();
    mockState = {
      data: [
        { id: "c1", name: "Demo" },
        { id: "c2", name: "Other" },
      ],
    };
    render(<ModelPage />);
    expect(screen.getAllByTestId("terms").map((t) => t.dataset.open)).toEqual([
      "false",
      "false",
    ]);
  });

  it("opens the section a #connection-<id> link points at (#2533)", () => {
    mockState = {
      data: [
        { id: "c1", name: "Demo" },
        { id: "c2", name: "Other" },
      ],
    };
    window.location.hash = "#connection-c2";
    render(<ModelPage />);
    expect(screen.getAllByTestId("terms").map((t) => t.dataset.force)).toEqual([
      "false",
      "true",
    ]);
    window.location.hash = "";
  });

  it("Export downloads the model file", () => {
    render(<ModelPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    expect(mockDownload).toHaveBeenCalledTimes(1);
  });

  it("Export that fails says so in a toast", async () => {
    mockDownload.mockRejectedValueOnce(new Error("boom"));
    render(<ModelPage />);
    fireEvent.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() =>
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ title: "Could not export the model" }),
      ),
    );
  });
});
